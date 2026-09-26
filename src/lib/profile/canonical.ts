// One serialisation for the stored profile: keys in schema order at every depth, unknown figures
// left out. Two saves or exports of one profile are then byte-identical, whatever order the object
// was built in, which is what lets the store skip a write that changes nothing.
import { z } from 'zod';
import { StoredProfileSchema, type StoredProfile } from './schema';

function ordered(schema: z.ZodType, value: unknown): unknown {
	if (value === null || value === undefined) return value;
	if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
		return ordered(schema.unwrap() as z.ZodType, value);
	}
	if (schema instanceof z.ZodArray && Array.isArray(value)) {
		return value.map((item) => ordered(schema.element as z.ZodType, item));
	}
	if (schema instanceof z.ZodObject && typeof value === 'object') {
		const source = value as Record<string, unknown>;
		const result: Record<string, unknown> = {};
		for (const [key, field] of Object.entries(schema.shape)) {
			if (source[key] !== undefined) result[key] = ordered(field as z.ZodType, source[key]);
		}
		return result;
	}
	return value;
}

export function canonicalStoredJson(stored: StoredProfile): string {
	return JSON.stringify(ordered(StoredProfileSchema, stored));
}
