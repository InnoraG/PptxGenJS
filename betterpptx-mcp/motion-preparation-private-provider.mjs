import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertTrustedMotionPreparationRepository } from './motion-preparation-repository-contract.mjs';
import {motionProgramProviderSpecifier} from './motion-program-default-provider.mjs';

const unavailable = () => new Error('The trusted motion-preparation provider could not be initialized.');

/** Load the owner-configured local provider for product startup. */
export async function loadTrustedMotionPreparationRepository(specifier = process.env.BETTERPPTX_MOTION_PREPARATION_PROVIDER_MODULE) {
	specifier=motionProgramProviderSpecifier(specifier);
	if (specifier === undefined || specifier === null || String(specifier).trim() === '') return undefined;
	if (typeof specifier !== 'string' || specifier.length > 4096 || /[\x00-\x1f\x7f]/.test(specifier)) throw unavailable();

	let url;
	try {
		url = specifier.startsWith('file:') ? new URL(specifier) : pathToFileURL(path.resolve(specifier));
	} catch {
		throw unavailable();
	}
	if (url.protocol !== 'file:') throw unavailable();

	try {
		const provider = await import(url.href);
		if (typeof provider.createTrustedMotionPreparationRepository !== 'function') throw unavailable();
		return assertTrustedMotionPreparationRepository(await provider.createTrustedMotionPreparationRepository());
	} catch {
		throw unavailable();
	}
}
