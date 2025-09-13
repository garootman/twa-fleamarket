import MainPage from './MainPage';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

function App(): JSX.Element {
  const queryClient = new QueryClient();
  return (
    <QueryClientProvider client={queryClient}>
      <MainPage />
    </QueryClientProvider>
  );
}

export default App;
