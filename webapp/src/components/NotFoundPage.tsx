import { CenterLayout, Text, Button } from './ui';

interface NotFoundPageProps {
  onGoHome?: () => void;
}

function NotFoundPage({ onGoHome }: NotFoundPageProps): JSX.Element {
  return (
    <CenterLayout>
      <div className="text-6xl mb-5">🔍</div>

      <Text variant="title" className="mb-4">
        Page Not Found
      </Text>

      <Text variant="body" color="hint" className="leading-relaxed mb-6 max-w-xs text-center">
        Sorry, the page you&apos;re looking for doesn&apos;t exist or has been moved.
      </Text>

      {onGoHome && (
        <Button size="md" onClick={onGoHome}>
          Go to Home
        </Button>
      )}
    </CenterLayout>
  );
}

export default NotFoundPage;
