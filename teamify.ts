#!/usr/bin/env ts-node-dev

import _ from "lodash"

import { filenames, read, write, writeCsv } from "./git-historical-blame"
import { Group } from "./group"

export type Teammate = {
	fullname: string
	email: string
	team: string
}

export type TeamifyOpts = {
	teamsFilepath: string
}

export async function teamify({
	teamsFilepath
}: TeamifyOpts) {
	const grouped: Group[] = read(filenames.grouped)
	const teams: Teammate[] = read(teamsFilepath)

	const groupedWithTeam = grouped.map(({ filepaths, ...g }) => 
		Object.assign(g, {
				team: findMatchingTeam(g, teams),
				filepaths,
			}
		)
	)

	write(filenames.teamified, groupedWithTeam)

	const groupedWithTeamCsv: Record<string, string>[] = groupedWithTeam.map(g => ({
			team: g.team || "null",
			total_ownership: g.totalOwnership.toString(),
			files_modified: g.filepaths.length.toString(),
			author_name: g.authorName,
			author_email: g.authorEmail,
			adds: g.adds.toString(),
			dels: g.dels.toString(),
			both: g.both.toString(),
		})
	)
	writeCsv(filenames.teamified + ".csv", groupedWithTeamCsv) 

	const groupedWithTeamByTeam = Object.entries(_.groupBy(groupedWithTeam, "team")).map(([team, gg]) => ({
		team,
		totalOwnershipAggregate: Number(gg.reduce((acc, g) => acc + g.totalOwnership, 0).toFixed(2)),
		teammates: gg,
	}))
	write(filenames.byTeam, groupedWithTeamByTeam)

	const groupedWithTeamByTeamCsv: Record<string, string>[] = groupedWithTeamByTeam.map(({ teammates }) =>
		teammates.map(g => ({
			team: g.team || "null",
			total_ownership: g.totalOwnership.toString(),
			files_modified: g.filepaths.length.toString(),
			author_name: g.authorName,
			author_email: g.authorEmail,
			adds: g.adds.toString(),
			dels: g.dels.toString(),
			both: g.both.toString(),
		})
	)).flat()
	writeCsv(filenames.byTeam + ".csv", groupedWithTeamByTeamCsv) 

	const teamStats = groupedWithTeamByTeam.map(({ team, totalOwnershipAggregate }) => ({
		team,
		totalOwnershipAggregate,
	}));
	write(filenames.teamStats, teamStats)

	const teamStatsCsv = teamStats.map(t => ({
		team: t.team,
		total_ownership_aggregate: t.totalOwnershipAggregate.toString(),
	}));
	writeCsv(filenames.teamStats + ".csv", teamStatsCsv)
}

export type MiniGroup = {
    authorName: string
    authorEmail: string
};
function findMatchingTeam(g: MiniGroup, ts: Teammate[]): Teammate["team"] | null {
	let tmp: Teammate | undefined;
	if ((tmp = ts.find(t => t.fullname === g.authorName))) {
		return tmp.team
	}

	if ((tmp = ts.find(t => t.email === g.authorEmail))) {
		return tmp.team
	}
	
	return null
}


if (!module.parent) {
	process.argv.splice(0, 2)
	const teamsFilepath = process.argv[0]

	teamify({
		teamsFilepath,
	})
}

