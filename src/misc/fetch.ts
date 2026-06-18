import * as http from 'http';
import * as https from 'https';
import * as cache from 'lookup-dns-cache';
import fetch, { HeadersInit } from 'node-fetch';
import { HttpProxyAgent } from 'http-proxy-agent';
import { HttpsProxyAgent } from 'https-proxy-agent';
import config from '../config';
import {ILocalUser} from "../models/entities/user";
import requestGet from "../remote/activitypub/request-get";
import {Users} from "../models";

export async function getJson(url: string, accept = 'application/json, */*', timeout = 10000, headers?: HeadersInit, user?: ILocalUser) {
	if (user) {
		return await requestGet(user, url);
	} else {
		const u = await Users.find({
			isAdmin: true,
		});
		return await requestGet(u, url);
	}
}

/**
 * Get http non-proxy agent
 */
const _http = new http.Agent({
	keepAlive: true,
	keepAliveMsecs: 30 * 1000,
});

/**
 * Get https non-proxy agent
 */
const _https = new https.Agent({
	keepAlive: true,
	keepAliveMsecs: 30 * 1000,
	lookup: cache.lookup,
});

/**
 * Get http proxy or non-proxy agent
 */
export const httpAgent = config.proxy
	? new HttpProxyAgent(config.proxy)
	: _http;

/**
 * Get https proxy or non-proxy agent
 */
export const httpsAgent = config.proxy
	? new HttpsProxyAgent(config.proxy)
	: _https;

/**
 * Get agent by URL
 * @param url URL
 * @param bypassProxy Allways bypass proxy
 */
export function getAgentByUrl(url: URL, bypassProxy = false) {
	if (bypassProxy) {
		return url.protocol == 'http:' ? _http : _https;
	} else {
		return url.protocol == 'http:' ? httpAgent : httpsAgent;
	}
}
