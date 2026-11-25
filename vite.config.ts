import { defineConfig } from 'vite';

// GitHub Pages 하위 경로에서도 동작하도록 상대 경로를 쓴다.
export default defineConfig({
  base: './',
  server: { open: true, port: 5180 },
  // Phaser 자체가 약 1.2MB 라 기본 경고 기준(500kB)을 넘는다. 정상이므로 기준만 올림.
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});
