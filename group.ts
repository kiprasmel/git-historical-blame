#!/usr/bin/env ts-node-dev

import fs from "fs"

import _ from "lodash"

import { Output, filenames } from "./git-historical-blame"

export async function group() {
	const output: Output[] = JSON.parse(fs.readFileSync(filenames.blame, { encoding: "utf-8" }))
	const { totalChanged } = JSON.parse(fs.readFileSync(filenames.stats, { encoding: "utf-8" }))

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


	fs.writeFileSync(
		filenames.grouped,
		JSON.stringify(
			grouped,
			null,
			2
		),
		{ encoding: "utf-8" }
	)
}

if (!module.parent) {
	group()
}

