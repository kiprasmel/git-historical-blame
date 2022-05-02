#!/usr/bin/env ts-node-dev

import _ from "lodash"

import { Output, filenames, read, write } from "./git-historical-blame"

export async function group() {
	const output: Output[] = read(filenames.blame)
	const { totalChanged } = read(filenames.stats)

	/**
	 * grouping!
	 */
	const grouped =
		Object.entries(
			_.groupBy(output, "author")
		).map(([author, changes]) => ({
			author,
			filepaths: changes.map(c => c.filepath),
			adds: changes.reduce((acc, c) => acc + c.adds!, 0),
			dels: changes.reduce((acc, c) => acc + c.dels!, 0),
		})).map(x => 
			Object.assign(x, {
				both: x.adds + x.dels,
				totalOwnership: (((x.adds + x.dels) / totalChanged) * 100).toFixed(2),
			})
		).sort((A, B)  => B.both - A.both)

	write(filenames.grouped, grouped)
}

if (!module.parent) {
	group()
}

