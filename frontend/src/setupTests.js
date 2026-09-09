import { TextDecoder, TextEncoder } from "util";

// React Router uses the browser encoding APIs; Jest 27's jsdom lacks them.
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
