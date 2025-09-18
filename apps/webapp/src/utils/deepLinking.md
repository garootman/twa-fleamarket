# Deep Linking with Telegram Web Apps

This implementation properly handles Telegram Web App URLs while preserving deep linking functionality.

## How it works

### URL Parsing Examples

1. **Basic Telegram Web App Launch:**

   ```
   Hash: #tgWebAppData=query_id%3DABC123%26user%3D...
   Result: { route: '/', tgWebAppData: 'query_id=ABC123&user=...', otherParams: {} }
   ```

2. **Deep Link with Telegram Data:**

   ```
   Hash: #/products/123?tgWebAppData=auth123&tgWebAppStartParam=promo_code
   Result: {
     route: '/products/123',
     tgWebAppData: 'auth123',
     startParam: 'promo_code',
     otherParams: {}
   }
   ```

3. **Deep Link with Custom Parameters:**
   ```
   Hash: #/categories/electronics?filter=sale&sort=price
   Result: {
     route: '/categories/electronics',
     otherParams: { filter: 'sale', sort: 'price' }
   }
   ```

## Setting up Deep Links

### In Your Bot

```typescript
// Send deep link to user
const deepLinkUrl = 'https://t.me/your_bot/your_app?startapp=product_123';
await bot.api.sendMessage(chatId, 'Check out this product!', {
  reply_markup: {
    inline_keyboard: [[{ text: 'View Product', web_app: { url: deepLinkUrl } }]],
  },
});
```

### In Your Web App

```typescript
// The app will automatically parse the URL and extract:
// - route: '/products/123' (if you set up routing for startapp parameter)
// - startParam: 'product_123'
// - tgWebAppData: 'auth_data_from_telegram'

// Access the parsed data in your components:
useEffect(() => {
  const handleHashChange = () => {
    const hash = window.location.hash.slice(1);
    const parsed = parseTelegramUrl(hash);

    if (parsed.startParam?.startsWith('product_')) {
      const productId = parsed.startParam.replace('product_', '');
      // Navigate to product page or show product modal
      setCurrentRoute(`/products/${productId}`);
    }
  };

  handleHashChange();
}, []);
```

## Adding New Routes

To add support for new deep link routes, update the `isValidRoute` function in `urlUtils.ts`:

```typescript
export function isValidRoute(route: string): boolean {
  const validRoutes = ['/', '/me'];
  const validPatterns = [
    /^\/products\/\d+$/, // /products/123
    /^\/categories\/[\w-]+$/, // /categories/electronics
    /^\/user\/\d+$/, // /user/456
    /^\/orders\/\d+$/, // /orders/789 (new!)
    /^\/search\/[\w-]+$/, // /search/electronics (new!)
  ];

  // ... rest of function
}
```

## Benefits

1. **Preserves Deep Linking:** Routes like `/products/123` work properly
2. **Handles Telegram Data:** Extracts `tgWebAppData` and start parameters
3. **Future-Proof:** Easy to add new route patterns
4. **Type-Safe:** Full TypeScript support
5. **Testable:** Comprehensive test coverage

## Migration from Old Approach

The old approach would break on URLs like:

- `#/products/123?tgWebAppData=...` → Would show 404
- `#tgWebAppData=...&route=/products/123` → Would default to home

The new approach correctly handles both scenarios and preserves the intended routing behavior.
