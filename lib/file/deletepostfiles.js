'use strict';

const { remove } = require('fs-extra')
	, uploadDirectory = require(__dirname+'/uploaddirectory.js')
	, r2 = require(__dirname+'/r2.js');

module.exports = async (files) => {

	//XDTV: także z R2 (pliki wysłane tam nie mają już kopii na dysku)
	await r2.removeFiles(files.map(file => ({
		filename: file.filename,
		thumbExts: file.hasThumb ? [file.thumbextension] : [],
	})));

	//delete all the files and thumbs
	return Promise.all(files.map(async file => {
		return Promise.all([
			remove(`${uploadDirectory}/file/${file.filename}`),
			file.hasThumb ? remove(`${uploadDirectory}/file/thumb/${file.hash}${file.thumbextension}`) : void 0,
		]).catch(console.error);
	}));

};
