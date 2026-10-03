'use strict';

/*
 * XDTV — pliki postów w Cloudflare R2.
 *
 * jschan przetwarza plik lokalnie (wymiary, miniatura, EXIF) w static/file,
 * potem ten moduł wysyła oryginał i miniaturę do R2 i kasuje kopię z dysku.
 * Klucze w buckecie:
 *   {prefiks}/{sha256}{ext}               oryginał
 *   {prefiks}/thumb/{sha256}{thumbext}    miniatura
 * prefiks: gif | film | grafika — wyznaczany z rozszerzenia, więc upload
 * i kasowanie zawsze trafiają w tę samą ścieżkę.
 *
 * Bez kompletu zmiennych R2_* moduł jest wyłączony i jschan działa
 * jak w oryginale (pliki na dysku pod /file/).
 */

const { S3Client, PutObjectCommand, DeleteObjectsCommand } = require('@aws-sdk/client-s3')
	, { createReadStream } = require('fs')
	, { stat } = require('fs/promises')
	, { remove } = require('fs-extra')
	, uploadDirectory = require(__dirname+'/uploaddirectory.js');

const { R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_URL } = process.env;

const enabled = Boolean(R2_ENDPOINT && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET && R2_PUBLIC_URL);

const client = enabled ? new S3Client({
	region: 'auto',
	endpoint: R2_ENDPOINT,
	credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
}) : null;

const VIDEO_EXTS = new Set(['.mp4', '.webm', '.mov', '.mkv', '.mpeg', '.mpg', '.ogv', '.m4v']);

const prefixFor = (filename) => {
	const ext = filename.slice(filename.lastIndexOf('.')).toLowerCase();
	if (ext === '.gif') {
		return 'gif';
	}
	if (VIDEO_EXTS.has(ext)) {
		return 'film';
	}
	return 'grafika';
};

const CONTENT_TYPES = {
	'.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.gif': 'image/gif',
	'.webp': 'image/webp', '.avif': 'image/avif', '.bmp': 'image/bmp', '.apng': 'image/apng',
	'.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
	'.mpeg': 'video/mpeg', '.mpg': 'video/mpeg',
};

const contentTypeFor = (name, fallback) => {
	return CONTENT_TYPES[name.slice(name.lastIndexOf('.')).toLowerCase()] || fallback || 'application/octet-stream';
};

const put = async (localPath, key, contentType) => {
	const { size } = await stat(localPath);
	await client.send(new PutObjectCommand({
		Bucket: R2_BUCKET,
		Key: key,
		Body: createReadStream(localPath),
		ContentLength: size,
		ContentType: contentType,
		// Nazwa to skrót zawartości — plik pod danym kluczem nigdy się nie zmienia.
		CacheControl: 'public, max-age=31536000, immutable',
	}));
};

module.exports = {

	enabled,

	publicUrl: enabled ? R2_PUBLIC_URL.replace(/\/+$/, '') : null,

	prefixFor,

	/*
	 * Wysyła oryginał i (jeśli jest) miniaturę przetworzonego pliku,
	 * potem kasuje lokalne kopie. Zwraca prefiks, który trafia do posta
	 * jako file.cdn — po nim szablony poznają, że plik leży w R2.
	 */
	uploadPostFile: async (file) => {
		const prefix = prefixFor(file.filename);
		const original = `${uploadDirectory}/file/${file.filename}`;
		const thumb = file.hasThumb ? `${uploadDirectory}/file/thumb/${file.hash}${file.thumbextension}` : null;
		await put(original, `${prefix}/${file.filename}`, contentTypeFor(file.filename, file.mimetype));
		if (thumb) {
			await put(thumb, `${prefix}/thumb/${file.hash}${file.thumbextension}`, contentTypeFor(file.thumbextension));
		}
		await Promise.all([remove(original), thumb ? remove(thumb) : null]);
		return prefix;
	},

	/*
	 * Kasuje z R2 oryginały i miniatury. `items`: [{ filename, thumbExts: [...] }].
	 * Błąd jest logowany, nie rzucany — post i tak znika z bazy, a sierota
	 * w buckecie kosztuje mniej niż przerwane kasowanie.
	 */
	removeFiles: async (items) => {
		if (!enabled || items.length === 0) {
			return;
		}
		const keys = [];
		for (const { filename, thumbExts } of items) {
			const prefix = prefixFor(filename);
			const hash = filename.slice(0, filename.lastIndexOf('.'));
			keys.push(`${prefix}/${filename}`);
			for (const ext of (thumbExts || []).filter(Boolean)) {
				keys.push(`${prefix}/thumb/${hash}${ext}`);
			}
		}
		for (let i = 0; i < keys.length; i += 1000) {
			try {
				await client.send(new DeleteObjectsCommand({
					Bucket: R2_BUCKET,
					Delete: { Objects: keys.slice(i, i+1000).map(Key => ({ Key })), Quiet: true },
				}));
			} catch (e) {
				console.error('[R2] kasowanie nie powiodło się:', e.message);
			}
		}
	},

};
