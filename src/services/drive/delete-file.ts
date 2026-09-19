import { DriveFile } from '../../models/entities/drive-file';
import { InternalStorage } from './internal-storage';
import { DriveFiles, Instances, Notes } from '../../models';
import { driveChart, perUserDriveChart, instanceChart } from '../chart';
import { createDeleteObjectStorageFileJob } from '../../queue';
import { getColdS3, getColdStorageConfig, getS3 } from './s3';
import config from '../../config';

export async function deleteFile(file: DriveFile, isExpired = false) {
	if (file.storedInternal) {
		InternalStorage.del(file.accessKey!);

		if (file.thumbnailUrl) {
			InternalStorage.del(file.thumbnailAccessKey!);
		}
	} else if (!file.isLink) {
		createDeleteObjectStorageFileJob(file.accessKey!, file.storedInColdStorage);

		if (file.thumbnailUrl) {
			createDeleteObjectStorageFileJob(file.thumbnailAccessKey!, file.storedInColdStorage);
		}
	}

	postProcess(file, isExpired);
}

export async function deleteFileSync(file: DriveFile, isExpired = false) {
	if (file.storedInternal) {
		InternalStorage.del(file.accessKey!);

		if (file.thumbnailUrl) {
			InternalStorage.del(file.thumbnailAccessKey!);
		}
	} else if (!file.isLink) {
		const promises = [];

		promises.push(deleteObjectStorageFile(file.accessKey!, file.storedInColdStorage));

		if (file.thumbnailUrl) {
			promises.push(deleteObjectStorageFile(file.thumbnailAccessKey!, file.storedInColdStorage));
		}

		await Promise.all(promises);
	}

	postProcess(file, isExpired);
}

function postProcess(file: DriveFile, isExpired = false) {
	// リモートファイル期限切れ削除後は直リンクにする
	if (isExpired && file.userHost !== null && file.uri != null) {
		DriveFiles.update(file.id, {
			isLink: true,
			url: file.uri,
			thumbnailUrl: file.uri,
			size: 0,
		});
	} else {
		DriveFiles.delete(file.id);

		// TODO: トランザクション
		Notes.createQueryBuilder().delete()
			.where(':id = ANY(fileIds)', { id: file.id })
			.execute();
	}

	// 統計を更新
	driveChart.update(file, false);
	perUserDriveChart.update(file, false);
	if (file.userHost !== null) {
		instanceChart.updateDrive(file, false);
		Instances.decrement({ host: file.userHost }, 'driveUsage', file.size);
		Instances.decrement({ host: file.userHost }, 'driveFiles', 1);
	}
}

export async function deleteObjectStorageFile(key: string, cold = false) {
	const s3 = cold ? getColdS3() : getS3();
	const bucket = cold ? getColdStorageConfig().bucket! : config.drive.bucket!;

	await s3.deleteObject({
		Bucket: bucket,
		Key: key
	}).promise();
}
