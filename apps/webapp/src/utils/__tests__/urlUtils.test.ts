import { describe, it, expect } from 'vitest';
import { parseTelegramUrl, buildTelegramUrl, isValidRoute } from '../urlUtils';

describe('urlUtils', () => {
  describe('parseTelegramUrl', () => {
    it('should parse empty hash to home route', () => {
      expect(parseTelegramUrl('')).toEqual({
        route: '/',
        otherParams: {},
      });
    });

    it('should parse simple route', () => {
      expect(parseTelegramUrl('/me')).toEqual({
        route: '/me',
        otherParams: {},
      });
    });

    it('should parse legacy tgWebAppData only hash', () => {
      const result = parseTelegramUrl(
        'tgWebAppData=query_id%3DABC123&tgWebAppStartParam=product_456'
      );
      expect(result.route).toBe('/');
      expect(result.tgWebAppData).toBe('query_id=ABC123'); // URLSearchParams decodes %3D to =
      expect(result.startParam).toBe('product_456');
    });

    it('should parse route with tgWebAppData parameters', () => {
      const result = parseTelegramUrl('/products/123?tgWebAppData=abc&tgWebAppStartParam=xyz');
      expect(result.route).toBe('/products/123');
      expect(result.tgWebAppData).toBe('abc');
      expect(result.startParam).toBe('xyz');
    });

    it('should parse route with other parameters', () => {
      const result = parseTelegramUrl('/me?tab=settings&theme=dark');
      expect(result.route).toBe('/me');
      expect(result.otherParams).toEqual({
        tab: 'settings',
        theme: 'dark',
      });
    });

    it('should parse complex deep link', () => {
      const result = parseTelegramUrl(
        '/categories/electronics?tgWebAppData=auth123&filter=sale&sort=price'
      );
      expect(result.route).toBe('/categories/electronics');
      expect(result.tgWebAppData).toBe('auth123');
      expect(result.otherParams).toEqual({
        filter: 'sale',
        sort: 'price',
      });
    });
  });

  describe('buildTelegramUrl', () => {
    it('should build simple route', () => {
      expect(buildTelegramUrl('/me')).toBe('/me');
    });

    it('should build route with tgWebAppData', () => {
      const result = buildTelegramUrl('/products/123', {
        tgWebAppData: 'abc123',
        startParam: 'product_456',
      });
      expect(result).toBe('/products/123?tgWebAppData=abc123&tgWebAppStartParam=product_456');
    });

    it('should build route with other parameters', () => {
      const result = buildTelegramUrl('/me', {
        otherParams: { tab: 'settings', theme: 'dark' },
      });
      expect(result).toBe('/me?tab=settings&theme=dark');
    });
  });

  describe('isValidRoute', () => {
    it('should validate basic routes', () => {
      expect(isValidRoute('/')).toBe(true);
      expect(isValidRoute('/me')).toBe(true);
    });

    it('should validate deep link patterns', () => {
      expect(isValidRoute('/products/123')).toBe(true);
      expect(isValidRoute('/categories/electronics')).toBe(true);
      expect(isValidRoute('/user/456')).toBe(true);
    });

    it('should reject invalid routes', () => {
      expect(isValidRoute('/invalid')).toBe(false);
      expect(isValidRoute('/products')).toBe(false);
      expect(isValidRoute('/products/abc')).toBe(false);
      expect(isValidRoute('invalid')).toBe(false);
    });
  });
});
