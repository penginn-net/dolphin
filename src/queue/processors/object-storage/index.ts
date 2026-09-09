import * as Bull from 'bull';
import deleteFile from './delete-file';
import cleanRemoteFiles from './clean-remote-files';
import migrateToColdStorage from './migrate-to-cold-storage';

const jobs = {
	deleteFile,
	cleanRemoteFiles,
	migrateToColdStorage,
} as any;

export default function(q: Bull.Queue) {
	for (const [k, v] of Object.entries(jobs)) {
		q.process(k, 16, v as any);
	}
}
