import * as https from 'https';
import { sign } from '@peertube/http-signature';
import config from '../../config';
import { ILocalUser } from '../../models/entities/user';
import { UserKeypairs } from '../../models';
import { ensure } from '../../prelude/ensure';
import { getAgentByUrl } from '../../misc/fetch';

export default async (user: ILocalUser, url: string) => {
	const timeout = 10 * 1000;

	const { protocol, hostname, port, pathname, search } = new URL(url);

	const keypair = await UserKeypairs.findOne({
		userId: user.id
	}).then(ensure);

	return await new Promise((resolve, reject) => {
		const req = https.request({
			agent: getAgentByUrl(new URL(`https://example.net`)),
			protocol,
			hostname,
			port,
			method: 'GET',
			path: pathname + search,
			timeout,
			headers: {
				'User-Agent': config.userAgent,
				'Accept': 'application/activity+json, application/ld+json',
			}
		}, res => {
			if (res.statusCode! >= 400) {
				reject(res);
				res.resume;
				return;
			}
			let data = '';
			res.on('data', (chunk) => { data += chunk; });
			res.on('end', () =>{
				resolve(JSON.parse(res.responseText));
			})
		});

		sign(req, {
			authorizationHeaderName: 'Signature',
			key: keypair.privateKey,
			keyId: `${config.url}/users/${user.id}#main-key`,
			headers: ['(request-target)', 'date', 'host', 'accept']
		});

		req.on('timeout', () => req.abort());

		req.on('error', e => {
			if (req.aborted) reject('timeout');
			reject(e);
		});
		req.end();
	});
};
