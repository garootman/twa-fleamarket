export interface User {
  id: number;
  firstName: string;
  lastName?: string;
  username?: string;
  telegramId: number;
  imageUrl?: string;
}

export interface InitResponse {
  token: string;
  startParam?: string;
  startPage: string;
  user: User;
}

export interface MeResponse {
  user: User;
}

// Calendar interfaces removed - functionality not needed

const initMiniApp = async (initData: string): Promise<InitResponse> => {
  const response = await fetch(import.meta.env.VITE_BACKEND_URL + '/miniApp/init', {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ initData: initData }),
  });
  if (!response.ok) {
    throw new Error(`Bot error: ${response.status} ${response.statusText}}`);
  }
  return response.json();
};

const getMe = async (token: string): Promise<MeResponse> => {
  const response = await fetch(import.meta.env.VITE_BACKEND_URL + '/miniApp/me', {
    method: 'GET',
    mode: 'cors',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
  });
  if (!response.ok) {
    throw new Error(`Bot error: ${response.status} ${response.statusText}}`);
  }
  return response.json();
};

// Calendar functions removed - functionality not needed

export { initMiniApp, getMe };
