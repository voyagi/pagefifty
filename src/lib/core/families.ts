// The eForms criterion code, never the model, decides which comparison a criterion gets (SPEC R4,
// R5). Loaded under Node type stripping like the rest of src/lib/core: erasable syntax, no imports.

export type CriterionFamily =
	| 'turnover-general'
	| 'turnover-specific'
	| 'staff-average'
	| 'certificate'
	| 'firm-judges'
	| 'insurance'
	| 'not-assessed'
	| 'not-compared';

// A Map, as the code tables of tender-page.ts are, so an inherited name such as "constructor" finds
// no family. References and staff by role or field are matched to a buyer-named category that only
// the firm can confirm, so code never compares them.
const FAMILIES: ReadonlyMap<string, CriterionFamily> = new Map([
	['slc-stand-to-gen', 'turnover-general'],
	['slc-stand-to-avg', 'turnover-general'],
	['slc-stand-to-spec', 'turnover-specific'],
	['slc-stand-to-spec-avg', 'turnover-specific'],
	['slc-abil-staff-yrly-avg-mp', 'staff-average'],
	['slc-sche-qu-cert-indep', 'certificate'],
	['slc-sche-env-cert-indep', 'certificate'],
	['slc-abil-qual-inst', 'certificate'],
	['slc-abil-ref-services', 'firm-judges'],
	['slc-abil-ref-supply', 'firm-judges'],
	['slc-abil-ref-work', 'firm-judges'],
	['slc-abil-staff-qual', 'firm-judges'],
	['slc-abil-staff-tech-ctrl', 'firm-judges'],
	['slc-abil-staff-tech-work', 'firm-judges'],
	['slc-abil-staff-yrly-no-mgmt', 'firm-judges'],
	['slc-stand-ins', 'insurance'],
	['slc-suit-reg-prof', 'not-assessed'],
	['slc-suit-reg-trade', 'not-assessed'],
	['slc-suit-auth-mbrshp', 'not-assessed']
]);

const CODE_PERIODS: ReadonlyMap<string, 'yearly' | 'average'> = new Map([
	['slc-stand-to-gen', 'yearly'],
	['slc-stand-to-spec', 'yearly'],
	['slc-stand-to-avg', 'average'],
	['slc-stand-to-spec-avg', 'average']
]);

export function familyOf(code: string): CriterionFamily {
	return FAMILIES.get(code) ?? 'not-compared';
}

export function codePeriodOf(code: string): 'yearly' | 'average' | undefined {
	return CODE_PERIODS.get(code);
}
