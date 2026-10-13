import type {MotionSourceReviewInput} from './motion-source-authoring-reviews.mjs'
export type TrustedMotionSourceReviewCatalog = {resourceOwner:{schemaVersion:'betterpptx.resource-owner.v1';kind:'install'|'connector'|'session';id:string};records:MotionSourceReviewInput[];catalogScope?:'private'|'built-in'}
export function initializeMotionSourceReviewCatalogs(catalogs:TrustedMotionSourceReviewCatalog[]):void
export function loadTrustedMotionSourceReviewCatalogs(specifier?:string|null):Promise<TrustedMotionSourceReviewCatalog[]|undefined>
