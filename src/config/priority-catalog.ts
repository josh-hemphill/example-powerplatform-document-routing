/**
 * Bundled priority-level seed for local demo / first boot.
 * Runtime catalog comes from GET /control/priority-levels; Admin can deactivate rows.
 */
import type { PriorityLevelRecord } from '../domain/priority-catalog.ts';
import { MISSION_CRITICAL_REASON_MIN_LENGTH } from '../domain/priority-catalog.ts';

export const SEED_PRIORITY_LEVELS: PriorityLevelRecord[] = [
	{
		key: 'low',
		label: 'Low',
		rank: 10,
		color: 'default',
		requiresReason: false,
		minReasonLength: 0,
		reasonHint: '',
		active: true,
		slaHoursMultiplier: null,
	},
	{
		key: 'normal',
		label: 'Normal',
		rank: 20,
		color: 'info',
		requiresReason: false,
		minReasonLength: 0,
		reasonHint: '',
		active: true,
		slaHoursMultiplier: null,
	},
	{
		key: 'high',
		label: 'High',
		rank: 30,
		color: 'warning',
		requiresReason: false,
		minReasonLength: 0,
		reasonHint: '',
		active: true,
		slaHoursMultiplier: null,
	},
	{
		key: 'mission_critical',
		label: 'Mission critical',
		rank: 40,
		color: 'error',
		requiresReason: true,
		minReasonLength: MISSION_CRITICAL_REASON_MIN_LENGTH,
		reasonHint:
			'Explain why this request is mission-critical (impact, deadline, and who is blocked).',
		active: true,
		slaHoursMultiplier: null,
	},
];
