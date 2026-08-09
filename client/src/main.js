import { createApp } from 'vue';
import { requireSession } from '@temecriack/session';
import App from './App.vue';
import './styles/dejavu-fonts.scss';
import './styles/main.scss';

/**
 * Boot: require a usable admin access JWT before mounting the UI.
 * No token / failed refresh → SDK redirects to `/temecriack/auth/login`
 * with `returnTo` = current pdf-compiler path (allowlisted in session SDK).
 * Server API gate is a separate stage — this only protects the SPA shell.
 */
async function bootstrap() {
  const authenticated = await requireSession({ skewSec: 60 });
  if (!authenticated) return;
  createApp(App).mount('#app');
}

bootstrap();
