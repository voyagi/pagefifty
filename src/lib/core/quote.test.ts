import { describe, expect, it } from 'vitest';
import { lotClauseTexts, replyRequirements } from '../../test/fixtures/replies';
import { verifyRequirements, type RequirementCheck } from './quote';

describe('verifyRequirements on recorded replies', () => {
	it('the German thinking-off reply finds all 14 quotes in their own clauses', () => {
		const items = replyRequirements('de-610242-thinking-off');
		const sources = lotClauseTexts('de-610242-thinking-off');
		expect(items).toHaveLength(14);
		expect(sources).toHaveLength(6);
		const results: RequirementCheck[] = verifyRequirements(sources, items);
		expect(results).toHaveLength(14);
		results.forEach((result, index) => {
			expect(result, `item ${index + 1}`).toMatchObject({
				status: 'verified',
				criterion: items[index].criterion
			});
			if (result.status === 'verified') expect(result.start).toBeGreaterThanOrEqual(0);
		});
	});
});
