import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command, mode }) => {
  if (command === 'build') {
    // 배포 빌드 로그에서 어느 백엔드에 연결되는지 바로 확인할 수 있게 한 줄 남긴다.
    const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
    const backend = env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY ? `Supabase (${env.VITE_SUPABASE_URL})` : '데모 모드 (Supabase 미설정)';
    console.log(`[braindebt] 백엔드: ${backend} · 공유 주소: ${env.VITE_PUBLIC_URL || '현재 접속 주소'}`);
  }
  return {
    plugins: [react(), tailwindcss()],
    server: { host: true },
  };
});
