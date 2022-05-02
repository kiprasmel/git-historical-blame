#!/usr/bin/env ts-node-dev

import { execSync } from "child_process"
import assert from "assert"
import fs from "fs"
import path from "path"

import c from "chalk"

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
}
const defaultSinceCommittish = "origin/master" as const
const defaultIncludeCommitsAfterCommittish = false as const

export async function gitHistoricalBlame({
	repoPath,
	sinceCommittish = defaultSinceCommittish,
	includeCommitsAfterCommittish = defaultIncludeCommitsAfterCommittish,
}: Opts) {
	// prints to stdout
	const execPrint = (c: string) => execSync(c, { cwd: repoPath, stdio: "inherit" });
	noop(execPrint)

	// returns stdout
	const execRead = (c: string): string => execSync(c, { cwd: repoPath, stdio: "pipe" }).toString();

	const findFilesCmd = `git diff --stat=1000 ${sinceCommittish} | head -n -1 | cut -d"|" -f1`
	const filepaths: string[] = execRead(findFilesCmd).split("\n")
		.map(f => f.trim())
		.slice(0, -1) // remove empty

	const outfile = "historical-blame.json" as const
	const outfileStream = fs.createWriteStream(outfile)
	let progress = 0

	// TODO: get rid of .json in the first place
	outfileStream.write("[")
	let firstWrite = true

	for (const filepath of filepaths) {
		console.log(formatProgress(++progress, filepaths.length, filepath))

		if (!firstWrite) {
			outfileStream.write(",")
		}
		firstWrite = false

		const absFilepath: string = path.join(repoPath, filepath)
		if (!fs.existsSync(absFilepath)) {
			// got deleted

			outfileStream.write(JSON.stringify({
				filepath,
				info: "deleted"
			}))

			continue
		}

		const extra1 = includeCommitsAfterCommittish ? "" : sinceCommittish
		const fileHistoricalCmd = `git log ${extra1} --stat=1000 --follow --pretty=format:"%H%n%aN%n%aE" ${filepath}`
		const fileHistorical: string = execRead(fileHistoricalCmd)

		const entriesByCommit: string[][] = fileHistorical.split("\n\n").map(e => e.split("\n"))
		entriesByCommit[entriesByCommit.length - 1].pop() // remove empty

		const lengths = entriesByCommit.map(e => e.length)
		for (const len of lengths) {
			assert.equal(lengths[0], len)
		};

		const entries: Entry[] = entriesByCommit.map(parseEntryFromStrings(filepath))

		/**
		 * maybe "CumulativeEntry" or "CumulativeModifications"
		 */
		type Modifications = {
			adds: Entry["insertions"]
			dels: Entry["deletions"]
			both: Entry["totalChanges"]
		};
		const totalChangesByAuthor: Map<Entry["authorEmail"], Modifications> = new Map()
		for (const e of entries) {
			if (!totalChangesByAuthor.has(e.authorEmail)) {
				totalChangesByAuthor.set(e.authorEmail, {
					adds: 0,
					dels: 0,
					both: 0,
				})
			}

			const tmp: Modifications = totalChangesByAuthor.get(e.authorEmail)!
			totalChangesByAuthor.set(e.authorEmail, {
				adds: tmp.adds + e.insertions,
				dels: tmp.dels + e.deletions,
				both: tmp.both + e.totalChanges,
			})
		};

		const totalChangesByAuthorParsed = [...totalChangesByAuthor.entries()].sort((A, B)  => B[1].both - A[1].both)

		const sumOfTotalChanges = totalChangesByAuthorParsed.reduce((acc, [_, { both }]) => acc + both, 0)

		outfileStream.write(JSON.stringify({
			filepath,
			totalChangesByAuthorParsed: align2D(
				totalChangesByAuthorParsed.map((c) =>
					([
						c[0],
						"+" + c[1].adds,
						"-" + c[1].dels,
						"±" + c[1].both,
						"%" + (c[1].both / sumOfTotalChanges).toFixed(2),
					])
				),
				"  ",
			)
		}))
	}

	outfileStream.end("]\n")

	fs.writeFileSync(
		outfile,
		JSON.stringify(
			fs.readFileSync(outfile, { encoding: "utf-8" }),
			null,
			2,
		)
	);

	console.log({
		outfile,
	});
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

	gitHistoricalBlame({
		repoPath,
		sinceCommittish,
		includeCommitsAfterCommittish,
	})
}

