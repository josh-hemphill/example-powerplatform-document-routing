import type { ConnectionProfile } from './connection-config.ts';
import type { DataverseProvisionPlan } from './dataverse-provision-plan.ts';
import { assertSafeCliToken, shellQuote } from './shell-quote.ts';

export interface PaCommand {
	title: string;
	command: string;
}

export interface PaConnectOptions {
	/** Force legacy direct connection-id wiring (overrides profile when set). */
	legacyDirectConnection?: boolean;
}

/**
 * Builds non-interactive `pa` commands to wire Dataverse tables + SharePoint.
 * Default path is connection-reference bind; set `legacyDirectConnection` for scratch.
 */
export function buildPaConnectCommands(
	profile: ConnectionProfile,
	plan: DataverseProvisionPlan,
	options: PaConnectOptions = {},
): PaCommand[] {
	const legacy
		= options.legacyDirectConnection
			?? profile.legacyDirectConnection
			?? false;
	return legacy
		? buildLegacyDirectCommands(profile, plan)
		: buildBindToRefCommands(profile, plan);
}

function commonFlags(profile: ConnectionProfile): string {
	const cloud = profile.powerPlatform.cloud ?? 'public';
	const environmentId = profile.powerPlatform.environmentId;
	const envFlag = looksReady(environmentId)
		? ` --environment-id ${shellQuote(environmentId)}`
		: '';
	const cloudFlag = cloud !== 'public' ? ` --cloud ${shellQuote(cloud)}` : '';
	return `${cloudFlag}${envFlag}`;
}

function buildBindToRefCommands(
	profile: ConnectionProfile,
	plan: DataverseProvisionPlan,
): PaCommand[] {
	const common = commonFlags(profile);
	const base = 'pnpm exec pa';
	const sharePointRef = plan.connectionReferences.find(
		(item) => item.purpose === 'sharepoint',
	);
	const dataverseRef = plan.connectionReferences.find(
		(item) => item.purpose === 'dataverse',
	);
	const sharePointConnector = assertSafeCliToken(
		sharePointRef?.connectorId
		?? profile.sharePoint.connectorId
		?? 'shared_sharepointonline',
		'sharePoint.connectorId',
	);
	const sharePointLogical = sharePointRef?.logicalName ?? `${plan.prefix}_sharepoint`;

	const commands: PaCommand[] = [
		{
			title:
				'Create SharePoint Online connection (bind this CONNECTION_ID to the solution connection reference next)',
			command: `${base} connection create --connector ${sharePointConnector} --display-name ${shellQuote(sharePointRef?.displayName ?? 'Document Routing SharePoint')}${common}`,
		},
		{
			title:
				`Ensure connection reference ${sharePointLogical} exists in solution `
				+ `${profile.solution.uniqueName} (from provision:apply --into-solution or maker portal)`,
			command: `echo "Bind CONNECTION_ID to connection reference ${sharePointLogical} in solution ${profile.solution.uniqueName} (maker portal → Connection references, or solution import binding)."`,
		},
	];

	if (dataverseRef) {
		commands.push({
			title:
				`Dataverse connection reference ${dataverseRef.logicalName} (flows / solution apps); `
				+ 'Code App tables below still use --org-url',
			command: `echo "Ensure ${dataverseRef.logicalName} is in solution ${profile.solution.uniqueName} and bind an org connection when importing."`,
		});
	}

	for (const table of plan.tableLogicalNames) {
		const safeTable = assertSafeCliToken(table, 'tableLogicalName');
		commands.push({
			title: `Add Dataverse table data source (${safeTable})`,
			command: `${base} app add data-source --connector dataverse --table ${safeTable} --org-url ${shellQuote(profile.dataverse.environmentUrl)}${common}`,
		});
	}

	commands.push({
		title:
			`Add SharePoint library data source (ALM owner: connection reference ${sharePointLogical}; replace CONNECTION_ID)`,
		command: `${base} app add data-source --connector ${sharePointConnector} --connection-id CONNECTION_ID --dataset ${shellQuote(profile.sharePoint.siteUrl)} --table ${shellQuote(profile.sharePoint.libraryName)}${common}`,
	});

	return commands;
}

function buildLegacyDirectCommands(
	profile: ConnectionProfile,
	plan: DataverseProvisionPlan,
): PaCommand[] {
	const common = commonFlags(profile);
	const base = 'pnpm exec pa';
	const sharePointConnector = assertSafeCliToken(
		profile.sharePoint.connectorId ?? 'shared_sharepointonline',
		'sharePoint.connectorId',
	);

	const commands: PaCommand[] = [
		{
			title:
				'Create SharePoint Online connection (legacy direct path — prefer connection references in shared orgs)',
			command: `${base} connection create --connector ${sharePointConnector} --display-name ${shellQuote('Document Routing SharePoint')}${common}`,
		},
	];

	for (const table of plan.tableLogicalNames) {
		const safeTable = assertSafeCliToken(table, 'tableLogicalName');
		commands.push({
			title: `Add Dataverse table data source (${safeTable})`,
			command: `${base} app add data-source --connector dataverse --table ${safeTable} --org-url ${shellQuote(profile.dataverse.environmentUrl)}${common}`,
		});
	}

	commands.push({
		title:
			'Add SharePoint library data source (legacy --connection-id; replace CONNECTION_ID from connection create/list)',
		command: `${base} app add data-source --connector ${sharePointConnector} --connection-id CONNECTION_ID --dataset ${shellQuote(profile.sharePoint.siteUrl)} --table ${shellQuote(profile.sharePoint.libraryName)}${common}`,
	});

	return commands;
}

function looksReady(environmentId: string): boolean {
	const value = environmentId.trim().toLowerCase();
	return Boolean(value) && !value.includes('replace_me') && !value.includes('example');
}

/**
 * Renders shell-friendly command list for adopters.
 */
export function renderPaCommandsScript(commands: PaCommand[]): string {
	const lines = [
		'#!/usr/bin/env bash',
		'# Generated by pnpm provision — review before running.',
		'# Default path: bind SharePoint CONNECTION_ID to the solution connection reference, then add data sources.',
		'# Set legacyDirectConnection: true in connections.json for scratch direct connection-id wiring.',
		'# SharePoint --dataset and Dataverse --org-url use your connections.json hosts (custom domains OK).',
		'# Values are POSIX single-quoted to avoid injection from connection profile fields.',
		'set -euo pipefail',
		'',
	];
	for (const item of commands) {
		lines.push(`# ${item.title}`);
		lines.push(item.command);
		lines.push('');
	}
	return `${lines.join('\n')}\n`;
}
