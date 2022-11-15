import fs from "fs"
import path from "path"
import assert from "assert"

import { Opts, Output, filenames, write, Entry, parseEntryFromStrings, Modifications, } from "./git-historical-blame"

export type ComputeIndividualFileDataArgs = {
	repoPath: Opts["repoPath"]
	filepath: string
	includeCommitsAfterCommittish: Opts["includeCommitsAfterCommittish"]
	sinceCommittish: Opts["sinceCommittish"]
	execRead: (cmd: string) => string
}

export type ComputeIndividualFileDataRet = {
	sumAdded: number
	sumDeleted: number
	sumOfTotalChanges: number
}

export const getDefaultIndividualFileData = (): ComputeIndividualFileDataRet => ({
	sumAdded: 0,
	sumDeleted: 0,
	sumOfTotalChanges: 0,
})

export function computeIndividualFileData({
	repoPath,
	filepath,
	includeCommitsAfterCommittish,
	sinceCommittish,
	execRead,
}: ComputeIndividualFileDataArgs): ComputeIndividualFileDataRet {
	const output: Output[] = []

	const absFilepath: string = path.join(repoPath, filepath)
	if (!fs.existsSync(absFilepath)) {
		// got deleted
		output.push({
			filepath,
			info: "deleted",
			adds: 0,
			dels: 0,
			both: 0,
			authorName: "",
		})

		return getDefaultIndividualFileData()
	}

	const extra1 = includeCommitsAfterCommittish ? "" : sinceCommittish
	const fileHistoricalCmd = `git log ${extra1} --stat=1000 --follow --pretty=format:"%H%n%aN%n%aE" ${filepath}`
	const fileHistorical: string = execRead(fileHistoricalCmd)

	const entriesByCommit: string[][] = fileHistorical.split("\n\n").map(e => e.split("\n"))
	entriesByCommit[entriesByCommit.length - 1].pop() // remove empty

	const lengths = entriesByCommit.map(e => e.length)
	for (const len of lengths) {
		assert.equal(lengths[0], len)
	}

	const entries: Entry[] = entriesByCommit.map(parseEntryFromStrings(filepath))

	const totalChangesByAuthor: Map<Entry["authorEmail"], Modifications> = new Map()
	for (const e of entries) {
		if (!totalChangesByAuthor.has(e.authorEmail)) {
			totalChangesByAuthor.set(e.authorEmail, {
				authorName: e.authorName,
				adds: 0,
				dels: 0,
				both: 0,
			})
		}

		const tmp: Modifications = totalChangesByAuthor.get(e.authorEmail)!
		totalChangesByAuthor.set(e.authorEmail, {
			authorName: e.authorName,
			adds: tmp.adds + e.insertions,
			dels: tmp.dels + e.deletions,
			both: tmp.both + e.totalChanges,
		})
	}

	const totalChangesByAuthorParsed = [...totalChangesByAuthor.entries()].sort((A, B)  => B[1].both - A[1].both)

	const [sumAdded, sumDeleted] = totalChangesByAuthorParsed.reduce(([a, d], [_, { adds, dels }]) => [a + adds, d + dels], [0, 0])
	//totalAdded += sumAdded
	//totalDeleted += sumDeleted
	const sumOfTotalChanges = sumAdded + sumDeleted

	/*
	outfileStream.write(JSON.stringify({
		filepath,
		totalChangesByAuthor: [
			...totalChangesByAuthor.entries()
		].map(e => ({
				author: e[0],
				...e[1],
				fraction: (e[1].both / sumOfTotalChanges).toFixed(2) 
			})
		),
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
	*/
	;
	(
		[
			...totalChangesByAuthor.entries()
		].forEach(e => output.push({
				filepath,
				authorEmail: e[0],
				...e[1],
				fraction: (e[1].both / sumOfTotalChanges).toFixed(2),
				
			})
		)
	)

	write(filenames.blame, output)

	return {
		sumAdded,
		sumDeleted,
		sumOfTotalChanges,
	}
}

export const compute = {
	computeIndividualFileData
}

