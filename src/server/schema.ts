/**
 * What the server accepts from the robot. Text the robot gathers (page, element, console) is cut to length rather
 * than refused, so a message never fails on its details; only the message itself and the pictures are checked.
 */
import { z } from 'zod';

const Rect = z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() });
const short = (max: number) => z.string().transform((s) => (s.length > max ? s.slice(0, max) : s));
const upTo = <T extends z.ZodTypeAny>(item: T, max: number) => z.array(item).transform((a) => a.slice(0, max));

export const TargetSchema = z.object({
    selector: short(600),
    tag: short(40),
    id: short(200).optional(),
    classes: upTo(short(120), 12),
    role: short(60).optional(),
    label: short(300).optional(),
    text: short(400).optional(),
    data: z.record(short(80), short(200)).optional(),
    components: upTo(short(120), 10),
    rect: Rect,
    map: z.object({ lng: z.number(), lat: z.number(), zoom: z.number() }).optional(),
    summary: short(300),
});

/** A PNG as a data URL (its size is checked against the inbox's limits before this). */
const png = () => z.string().refine((s) => s.startsWith('data:image/png;base64,'), 'Screenshots must be PNG data URLs');

export const FeedbackInputSchema = z.object({
    message: z.string().trim().min(1, 'Write a message first').max(4000, 'Keep the message under 4,000 characters'),
    page: z.object({
        url: short(2000),
        path: short(800),
        title: short(300),
        viewport: z.object({ w: z.number().int().positive(), h: z.number().int().positive() }),
        dpr: z.number().positive().max(8),
    }),
    target: TargetSchema.nullable(),
    hand: z.object({ x: z.number(), y: z.number() }).nullable(),
    console: upTo(z.object({ level: z.enum(['error', 'warn']), text: short(2000), at: short(40) }), 40),
    screen: png().nullable(),
    focus: png().nullable(),
    replyTo: short(80).nullable().optional(),
});

export const StatusSchema = z.object({
    status: z.enum(['received', 'working', 'question', 'done']),
    reply: z.string().max(4000).nullable().optional(),
});
