'use client';

import { useId } from 'react';
import type { Point } from './arm';

/**
 * The feedback robot, drawn: a green robot head with a visor for eyes and an antenna that ends in
 * a yellow light. Its arm is drawn separately (FeedbackRobot.tsx), from the shoulder
 * sockets on its sides. One SVG for every pose; only the eyes and mouth change.
 */
export type RobotPose = 'standard' | 'blink' | 'happy' | 'think' | 'surprise';

const INK = '#0B0B0D';
const LED = '#9CFFC8';

function Eyes({ pose, gaze }: { pose: RobotPose; gaze: Point }) {
    const gx = Math.max(-5, Math.min(5, gaze.x * 1.4));
    const gy = Math.max(-3.5, Math.min(3.5, gaze.y * 1.2));
    if (pose === 'blink')
        return (
            <g stroke={LED} strokeWidth="3" strokeLinecap="round">
                <path d="M44 63H54" />
                <path d="M66 63H76" />
            </g>
        );
    if (pose === 'happy')
        return (
            <g fill="none" stroke={LED} strokeWidth="3.2" strokeLinecap="round">
                <path d="M43.5 65Q49 57.5 54.5 65" />
                <path d="M65.5 65Q71 57.5 76.5 65" />
            </g>
        );
    const big = pose === 'surprise';
    const look = pose === 'think' ? { x: 3.5, y: -3 } : { x: gx, y: gy };
    return (
        <g fill={LED}>
            <rect x={49 - (big ? 6 : 5) + look.x} y={63 - (big ? 8 : 6.5) + look.y} width={big ? 12 : 10} height={big ? 16 : 13} rx={big ? 6 : 5} />
            <rect x={71 - (big ? 6 : 5) + look.x} y={63 - (big ? 8 : 6.5) + look.y} width={big ? 12 : 10} height={big ? 16 : 13} rx={big ? 6 : 5} />
        </g>
    );
}

function Mouth({ pose }: { pose: RobotPose }) {
    if (pose === 'surprise') return <ellipse cx="60" cy="90" rx="3.6" ry="4.4" fill={INK} />;
    if (pose === 'think') return <path d="M55 90H66" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />;
    if (pose === 'happy') return <path d="M51 87.5Q60 97 69 87.5" fill="none" stroke={INK} strokeWidth="3.2" strokeLinecap="round" />;
    return <path d="M53 88Q60 93.5 67 88" fill="none" stroke={INK} strokeWidth="3" strokeLinecap="round" />;
}

export function RobotCharacter({ pose = 'standard', size = 64, gaze = { x: 0, y: 0 }, glow = false }: { pose?: RobotPose; size?: number; gaze?: Point; glow?: boolean }) {
    const id = useId().replace(/[^a-zA-Z0-9_-]/g, '');
    return (
        <svg className={`fb-char fb-char--${pose}${glow ? ' is-glow' : ''}`} width={size} height={size} viewBox="0 0 120 120" aria-hidden focusable="false">
            <defs>
                <radialGradient id={`${id}-shell`} cx="0.36" cy="0.3" r="0.85">
                    <stop offset="0" stopColor="#B4F7CF" />
                    <stop offset="0.5" stopColor="#3FD07F" />
                    <stop offset="1" stopColor="#1E9A55" />
                </radialGradient>
            </defs>
            {/* Antenna, ending in the yellow light. */}
            <path d="M60 27V15" stroke={INK} strokeWidth="3.4" strokeLinecap="round" />
            <circle className="fb-char__light" cx="60" cy="10.5" r="5.6" fill="#FFCE34" stroke={INK} strokeWidth="2.2" />
            {/* Ears. */}
            <rect x="13.5" y="55" width="10" height="20" rx="4" fill="#23A35C" stroke={INK} strokeWidth="2.2" />
            <rect x="96.5" y="55" width="10" height="20" rx="4" fill="#23A35C" stroke={INK} strokeWidth="2.2" />
            {/* Head. */}
            <rect x="21" y="27" width="78" height="78" rx="27" fill={`url(#${id}-shell)`} stroke={INK} strokeOpacity="0.9" strokeWidth="2.4" />
            <ellipse cx="41" cy="40" rx="11" ry="5" transform="rotate(-24 41 40)" fill="#fff" opacity="0.4" />
            {/* Visor. */}
            <rect x="31" y="47" width="58" height="32" rx="15" fill="#0E2A1B" stroke={INK} strokeWidth="2" />
            <Eyes pose={pose} gaze={gaze} />
            <Mouth pose={pose} />
            {/* Shoulder sockets, where the arm comes out. */}
            <circle cx="21" cy="84" r="4.2" fill="#1B7F47" stroke={INK} strokeWidth="1.8" />
            <circle cx="99" cy="84" r="4.2" fill="#1B7F47" stroke={INK} strokeWidth="1.8" />
        </svg>
    );
}
