/** The four small icons the robot's panel uses, drawn inline so the package needs no icon set. */
export type IconName = 'x' | 'eyeOff' | 'target' | 'send';

const PATHS: Record<IconName, string[]> = {
    x: ['M18 6 6 18', 'M6 6l12 12'],
    eyeOff: ['M9.9 4.24A9.1 9.1 0 0 1 12 4c7 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68', 'M6.61 6.61A13.5 13.5 0 0 0 2 12s3 8 10 8a9.7 9.7 0 0 0 5.39-1.61', 'M14.12 14.12a3 3 0 1 1-4.24-4.24', 'M2 2l20 20'],
    target: ['M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20', 'M12 6a6 6 0 1 0 0 12a6 6 0 1 0 0-12', 'M12 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4'],
    send: ['M22 2 11 13', 'M22 2 15 22 11 13 2 9 22 2'],
};

export function Icon({ name, size = 16 }: { name: IconName; size?: number }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
            {PATHS[name].map((d) => (
                <path key={d} d={d} />
            ))}
        </svg>
    );
}
