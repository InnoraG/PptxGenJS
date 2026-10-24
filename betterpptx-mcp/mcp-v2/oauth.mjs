import { advertisedPublicTools } from '../public-manifest.mjs'
import { mcpV2ToolScopes } from './catalog.mjs'
import { oauthProtectedResourceMetadata as protectedResourceMetadata } from './oauth-metadata.mjs'

export {
	oauthAuthorizationServerCompatibilityPaths,
	oauthAuthorizationServerMetadata,
	oauthAuthorizationServerMetadataPath,
	wwwAuthenticateHeader,
} from './oauth-metadata.mjs'

// Fine-grained tool scopes come from the advertised catalog; OAuth mode uses
// the single product scope and never needs the catalog.
export function oauthProtectedResourceMetadata(options = {}) {
	return protectedResourceMetadata({ toolScopes: () => mcpV2ToolScopes(advertisedPublicTools()), ...options })
}
