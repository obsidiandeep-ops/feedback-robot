import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FeedbackRobot } from '@placeintelligence/feedback-robot';
import App from './App';

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <App />
        {import.meta.env.DEV && <FeedbackRobot />}
    </StrictMode>,
);
