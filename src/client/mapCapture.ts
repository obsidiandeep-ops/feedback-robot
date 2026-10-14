/**
 * Maps draw with WebGL, whose picture is gone once the browser has shown it, so a screenshot of the page would show
 * them blank. Register each map (Mapbox GL, MapLibre, anything with the same few methods) and, before a screenshot,
 * the robot asks it for its current frame (read in the moment it renders) and lays it over the map as an image until
 * the screenshot is taken. A registered map also tells the robot the place under its hand (lat, lng, zoom).
 *
 *   import { registerMapForCapture } from '@placeintelligence/feedback-robot';
 *   map.on('load', () => registerMapForCapture(map)); // returns a function that unregisters it
 */
export interface CapturableMap {
    getCanvas(): HTMLCanvasElement;
    once(type: 'render', listener: () => void): unknown;
    triggerRepaint(): void;
    getZoom(): number;
    unproject(point: [number, number]): { lng: number; lat: number };
}

const maps = new Set<CapturableMap>();

/** A map the robot can photograph and point into. Returns a function that unregisters it. */
export function registerMapForCapture(map: CapturableMap): () => void {
    maps.add(map);
    return () => {
        maps.delete(map);
    };
}

/** The map drawn on this canvas, if one registered. */
export function mapOnCanvas(canvas: Element): CapturableMap | null {
    for (const map of maps) if (map.getCanvas() === canvas) return map;
    return null;
}

function frameOf(map: CapturableMap): Promise<string | null> {
    return new Promise((resolve) => {
        let done = false;
        const finish = () => {
            if (done) return;
            done = true;
            try {
                resolve(map.getCanvas().toDataURL('image/png'));
            } catch {
                resolve(null);
            }
        };
        map.once('render', finish);
        map.triggerRepaint();
        // A map that can't render (hidden, lost context) still lets the screenshot go ahead.
        window.setTimeout(finish, 800);
    });
}

/** Cover every visible map with a picture of its current frame; call the returned function to remove them. */
export async function freezeMaps(): Promise<() => void> {
    const covers: HTMLImageElement[] = [];
    for (const map of maps) {
        const canvas = map.getCanvas();
        if (!canvas.isConnected) continue;
        const box = canvas.getBoundingClientRect();
        if (box.width < 2 || box.height < 2) continue;
        const url = await frameOf(map);
        if (!url) continue;
        const img = new Image();
        img.src = url;
        img.alt = '';
        await img.decode().catch(() => undefined);
        Object.assign(img.style, {
            position: 'absolute',
            left: '0px',
            top: '0px',
            width: `${canvas.clientWidth}px`,
            height: `${canvas.clientHeight}px`,
            pointerEvents: 'none',
        });
        canvas.insertAdjacentElement('afterend', img);
        covers.push(img);
    }
    return () => covers.forEach((img) => img.remove());
}
