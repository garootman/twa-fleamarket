import { CenterLayout, Text, Button } from './ui';

function UseTelegramPage(): JSX.Element {
  return (
    <CenterLayout>
      <div className="text-6xl mb-5">📱</div>

      <Text variant="title" className="mb-4">
        Use Telegram to Continue
      </Text>

      <Text variant="body" color="hint" className="leading-relaxed mb-6 max-w-xs text-center">
        This flea market app is designed to work within Telegram. Please open it through the
        Telegram bot to access all features.
      </Text>

      <Button
        as="a"
        href="https://telegram.org/"
        target="_blank"
        rel="noopener noreferrer"
        size="md"
        className="no-underline"
      >
        Open Telegram
      </Button>
    </CenterLayout>
  );
}

export default UseTelegramPage;
