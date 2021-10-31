import { customAlphabet } from 'nanoid';

const alpha = '23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';

// Custom uid generator
export const longUid = customAlphabet(alpha, 40);

// Custom uid generator
export const uid = customAlphabet(alpha, 15);

// Custom small uid generator
export const smallUid = customAlphabet(alpha, 5);
