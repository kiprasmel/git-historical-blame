#!/usr/bin/env ts-node-dev

import _ from "lodash"

import { Output, filenames, read, write } from "./git-historical-blame"

export type Group = {
    authorName: string
    authorEmail: string
    totalOwnership: number
    adds: number
    dels: number
    both: number
    filepaths: string[]
}

export async function group() {
	const output: Output[] = read(filenames.blame)
	const { totalChanged } = read(filenames.stats)

	/**
	 * grouping!
	 */
	const grouped: Group[] =
		Object.entries(
			_.groupBy(output, "authorEmail")
		).map(([authorEmail, changes]): Group => {
			const adds = changes.reduce((acc, c) => acc + c.adds!, 0)
			const dels = changes.reduce((acc, c) => acc + c.dels!, 0)
			const both = adds + dels

			return {
				authorName: changes[0].authorName,
				authorEmail,
				totalOwnership: Number(((both / totalChanged) * 100).toFixed(2)),
				adds, 
				dels,
				both,
				filepaths: changes.map(c => c.filepath),
			}
		}).sort((A, B)  => B.both - A.both)

	write(filenames.grouped, grouped)
}

if (!module.parent) {
	group()
}

