import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { feedbackRobot } from '@placeintelligence/feedback-robot/vite';

// The robot's inbox on Vite's dev server (never in a build).
export default defineConfig({ plugins: [react(), feedbackRobot()] });
