/**
 * Utility functions for handling Telegram Web App URLs and routing
 */

export interface ParsedTelegramUrl {
  route: string;
  tgWebAppData?: string;
  startParam?: string;
  otherParams: Record<string, string>;
}

/**
 * Parses a Telegram Web App URL hash to extract route and Telegram-specific data
 *
 * Examples:
 * - #/me -> { route: '/me', otherParams: {} }
 * - #tgWebAppData=... -> { route: '/', tgWebAppData: '...', otherParams: {} }
 * - #/products/123?tgWebAppData=...&tgWebAppStartParam=abc -> { route: '/products/123', tgWebAppData: '...', startParam: 'abc', otherParams: {} }
 */
export function parseTelegramUrl(hash: string): ParsedTelegramUrl {
  // Remove leading # if present
  const cleanHash = hash.startsWith('#') ? hash.slice(1) : hash;

  // If empty, default to home
  if (!cleanHash) {
    return { route: '/', otherParams: {} };
  }

  // Check if the entire hash is just tgWebAppData (legacy Telegram behavior)
  if (cleanHash.startsWith('tgWebAppData=')) {
    // Parse as query string to extract data
    const urlParams = new URLSearchParams(cleanHash);
    return {
      route: '/',
      tgWebAppData: urlParams.get('tgWebAppData') || undefined,
      startParam: urlParams.get('tgWebAppStartParam') || undefined,
      otherParams: extractOtherParams(urlParams, ['tgWebAppData', 'tgWebAppStartParam']),
    };
  }

  // Split into path and query parts
  const [pathPart, queryPart] = cleanHash.split('?', 2);

  // Extract route (path part)
  let route = pathPart || '/';
  if (!route.startsWith('/')) {
    route = '/' + route;
  }

  // Parse query parameters if they exist
  const urlParams = queryPart ? new URLSearchParams(queryPart) : new URLSearchParams();

  return {
    route,
    tgWebAppData: urlParams.get('tgWebAppData') || undefined,
    startParam: urlParams.get('tgWebAppStartParam') || undefined,
    otherParams: extractOtherParams(urlParams, ['tgWebAppData', 'tgWebAppStartParam']),
  };
}

/**
 * Builds a URL hash from route and Telegram data
 */
export function buildTelegramUrl(
  route: string,
  params?: {
    tgWebAppData?: string;
    startParam?: string;
    otherParams?: Record<string, string>;
  }
): string {
  const searchParams = new URLSearchParams();

  if (params?.tgWebAppData) {
    searchParams.set('tgWebAppData', params.tgWebAppData);
  }

  if (params?.startParam) {
    searchParams.set('tgWebAppStartParam', params.startParam);
  }

  if (params?.otherParams) {
    Object.entries(params.otherParams).forEach(([key, value]) => {
      searchParams.set(key, value);
    });
  }

  const queryString = searchParams.toString();
  return route + (queryString ? `?${queryString}` : '');
}

/**
 * Extracts parameters that are not in the excluded list
 */
function extractOtherParams(
  urlParams: URLSearchParams,
  excludeKeys: string[]
): Record<string, string> {
  const otherParams: Record<string, string> = {};

  urlParams.forEach((value, key) => {
    if (!excludeKeys.includes(key)) {
      otherParams[key] = value;
    }
  });

  return otherParams;
}

/**
 * Checks if a route is valid
 * Supports both exact matches and pattern matches for deep linking
 */
export function isValidRoute(route: string): boolean {
  const validRoutes = ['/', '/me'];
  const validPatterns = [
    /^\/products\/\d+$/, // /products/123
    /^\/categories\/[\w-]+$/, // /categories/electronics
    /^\/user\/\d+$/, // /user/456
  ];

  // Check exact matches first
  if (validRoutes.includes(route)) {
    return true;
  }

  // Check pattern matches for deep links
  return validPatterns.some(pattern => pattern.test(route));
}
