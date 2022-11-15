#!/usr/bin/env ts-node-dev

import { execSync } from "child_process"
import assert from "assert"
import fs from "fs"
import path from "path"

import c from "chalk"

import { compute } from "./compute"

/**
 * maybe "CumulativeEntry" or "CumulativeModifications"
 */
export type Modifications = {
	adds: Entry["insertions"]
	dels: Entry["deletions"]
	both: Entry["totalChanges"]
	authorName: Entry["authorName"]
};

export type Output = (Modifications & {
	filepath: string
}) & (
	({
		authorEmail: string
		authorName: string
		fraction: string
	}) | ({
		info: "deleted"
	})
)

export const filenames = {
	blame: "historical-blame.json",
	stats: "stats.json",
	grouped: "grouped.json",
	teamified: "teamified.json",
	byTeam: "by-team.json",
	teamStats: "team-stats.json",
} as const

export const read = (f: keyof typeof filenames | (string & {})) => JSON.parse(fs.readFileSync(f, { encoding: "utf-8" }))
export const write = <T>(f: keyof typeof filenames | (string & {}), json: T) => fs.writeFileSync(
		f,
		JSON.stringify(
			json,
			null,
			2
		),
		{ encoding: "utf-8" }
	)
export const writeCsvOld = (f: string, cols: string[], rows: string[][], sep: string = ",", linesep: string = "\n") => {
	const content =
		cols.join(sep)
		+ linesep
		+ rows.map(r => r.join(sep)).join(linesep)
		+ linesep

	fs.writeFileSync(
		f, 
		content,
		{ encoding: "utf-8" }
	)
}
export const writeCsv = (f: string, data: Record<string, string>[], sep: string = ",", linesep: string = "\n") => {
	const cols = Object.keys(data[0])
	const rows = data.map(Object.values)
	
	const content =
		cols.join(sep)
		+ linesep
		+ rows.map(r => r.join(sep)).join(linesep)
		+ linesep

	fs.writeFileSync(
		f, 
		content,
		{ encoding: "utf-8" }
	)
}

export type Opts = {
	repoPath: string
	/**
	 * defaults to "master"
	 */
	sinceCommittish?: string

	/**
	 * defaults to `false`
	 */
	includeCommitsAfterCommittish: boolean

	// []
	ignoredFilenames: string[]
}
const defaultSinceCommittish = "origin/master" as const
const defaultIncludeCommitsAfterCommittish = false as const
const defaultIgnoredFilenames: string[] = []

export async function gitHistoricalBlame({
	repoPath,
	sinceCommittish = defaultSinceCommittish,
	includeCommitsAfterCommittish = defaultIncludeCommitsAfterCommittish,
	ignoredFilenames = defaultIgnoredFilenames,
}: Opts) {
	console.log({
		repoPath,
		sinceCommittish,
		includeCommitsAfterCommittish,
		ignoredFilenames,
	})

	// prints to stdout
	const execPrint = (c: string) => execSync(c, { cwd: repoPath, stdio: "inherit" });
	noop(execPrint)

	// returns stdout
	const execRead = (c: string): string => execSync(c, { cwd: repoPath, stdio: "pipe" }).toString();

	const findFilesCmd = `git diff --stat=1000 ${sinceCommittish} | head -n -1 | cut -d"|" -f1`
	const filepaths: string[] = execRead(findFilesCmd).split("\n")
		.map(f => f.trim())
		.slice(0, -1) // remove empty
		.filter(filepath => !ignoredFilenames.includes(path.basename(filepath)))

	let totalAdded = 0
	let totalDeleted = 0

	for (let i = 0; i < filepaths.length; ++i) {
		const filepath = filepaths[i]

		console.log(formatProgress(i, filepaths.length, filepath))

		const { sumAdded, sumDeleted } = compute.computeIndividualFileData({
			repoPath, //
			filepath,
			includeCommitsAfterCommittish,
			sinceCommittish,
			execRead,
		})

		totalAdded += sumAdded
		totalDeleted += sumDeleted
	}

	const totalChanged = totalAdded + totalDeleted
	console.log({
		totalAdded,
		totalDeleted,
		totalChanged,
	})

	write(filenames.stats, {
		totalAdded,
		totalDeleted,
		totalChanged,
	})
}

function noop(..._xs: any[]): void {
	//
}

export type Entry<T extends string = string> = {
	sha: string
	authorName: string
	authorEmail: string

	/*
	 * the actual file path
	 */
	filepath: T;

	/**
	 * could be a regular filepath,
	 * or a partial path, with a rename indicator,
	 * etc?
	 */
	fileOperation: string


	insertions: number
	deletions: number
	totalChanges: number
};

// depends on the `fileHistoricalCmd` format
export function parseEntryFromStrings<T extends string = string>(filepath: T) {
	return (e: string[]): Entry<T> => {
		assert.equal(e.length, 5)

		const insDel = e[4].split(",").splice(1)

		let insertions = -1, deletions = -1
		if (insDel.length === 2) {
			insertions = Number(insDel[0].trim().split(" ")[0])
			deletions  = Number(insDel[1].trim().split(" ")[0])
		} else if (insDel.length === 1) {
			if (insDel[0].includes("insertion")) {
				insertions = Number(insDel[0].trim().split(" ")[0])
				deletions  = 0
			} else if (insDel[0].includes("deletion")) {
				insertions = 0 
				deletions  = Number(insDel[0].trim().split(" ")[0])
			} else {
				assert(false, `insDel length was 1, should've included 'insertion' or 'deletion', but didn't. checked: "${insDel}" `)
			}
		} else {
			assert(false, `insDel length shall be 2 or 1, but got \`${insDel.length}\``)
		}

		return {
			sha: e[0],
			authorName: e[1],
			authorEmail: e[2],
			filepath,
			fileOperation: e[3].split("|")[0].trim(),
			insertions, // Number(e[4].split(",")[1].trim().split(" ")[0]),
			deletions, // Number(e[4].split(",")[2].trim().split(" ")[0]),
			totalChanges: insertions + deletions
		}
	};
};

function formatProgress(i: number, n: number, s: string): string {
	const maxlen = n.toString().length
	const len = i.toString().length
	const leftpad = " ".repeat(maxlen - len)

	const fmt =
		"["
		+ leftpad
		+ c.yellow(i.toString())
		+ "/"
		+ c.yellow(n.toString())
		+ "]"
		+ " "
		+ s

	return fmt
};

noop(align2D)
function align2D(items: string[][], itemJoin: string = " "): string[] {
	for (let j = 0; j < items[0].length; j++) {
		let maxLenInColumn = 0 
		for (let i = 0; i < items.length; i++) {
			const columnItem = items[i][j]
			maxLenInColumn = Math.max(maxLenInColumn, columnItem.length)
		}
		for (let i = 0; i < items.length; i++) {
			const len = items[i][j].length
			const missingLen = maxLenInColumn - len
			items[i][j] = " ".repeat(missingLen) + items[i][j]
		}
	}

	const aligned = []
	for (let i = 0; i < items.length; i++) {
		aligned.push(items[i].join(itemJoin))
	}

	return aligned
};

/**
 * CLI
 */
if (!module.parent) {
	process.argv.splice(0, 2)
	const repoPath = process.argv[0]
	const sinceCommittish = process.argv[1] || defaultSinceCommittish
	const includeCommitsAfterCommittish = !!process.argv[2] ?? defaultIncludeCommitsAfterCommittish
	const ignoredFilenames = (process.argv[3] ?? "").split(",")

	gitHistoricalBlame({
		repoPath,
		sinceCommittish,
		includeCommitsAfterCommittish,
		ignoredFilenames,
	})
}

