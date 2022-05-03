# git-historical-blame

original problem:
have a big PR in a huge, multi-team repo. unclear who to ask for review.

solution:
find which devs have worked with the files that we modified in the PR,
aggregate by their teams, and kindly ask for reviews.

## current implementation & it's flaws 

for every single file that has been modified since `<committish>`,
will go thru the full history of the file (commits),
will collect info (additions, deletions, author), 
will aggregate them and, if extra info is provided,
will provide people-based and team-based statistics
of the ownership of the files.

the heuristics could be improved a ton --
currently there's a lot of overlapping ownership since every commit etc.,
but for starters, this will do.

## dependencies

- git
- node.js, tested with v12
	- yarn

## setup

```sh
git clone https://github.com/kiprasmel/git-historical-blame.git
# or:    git clone git@github.com:kiprasmel/git-historical-blame.git

cd git-historical-blame/

yarn
```

## usage

```sh
# pre-process the git history.
# note - matters in which committish the repo is checked out
./git-historical-blame.ts <../path/to/repo> \
                          <committish-of-file-modification-begin=origin/master> \
                          "" \
                          <files,to,ignore>

# re-group from file-by-file to author-by-author
./group.ts
```

basics done, some .json{.csv} files will be generated.
now, to enhance the data with team members,
provide a json file with an array of teammate objects:

```json
[
  {
    "fullname": "Kipras Melnikovas",
    "email": "kipras@kipras.org",
    "team": "Sigma"
  }
]
```

sidenote: see below [1] for quick scripts to transform your data 
if you have it in a different format &/ multiple files.

note: obviously, best results will be achieved
if the teammates' emails & names match
with those they provided in their ~/.gitconfig.
see `findMatchingTeam` in teamify.ts.
currently, there's no logic for duplicate merging,
or even more advanced things like Levenshtein/edit distance
to compare the names/email addresses, but those can be added
in the future / by yourself.

once ready, use the data like so (depends on previous scripts above):

```sh
./teamify <../path/to/teams.json>
```

this will produce multiple files:
- teamified.json{.csv} - same as grouped.json above, but adds the team to a person when it matches
- by-team.json{.csv} - same as previous, but also grouped by the team
- team-stats.json{.csv} - aggregate statistics per team.

the 2 (3) most interesting files will be `team-stats.csv`,
and `by-team.json.csv` (`by-team.json` for exact details).

### [1] example of quick scripts for combining the data from multiple files & transforming into wanted form:

combine.js:

```js
#!/usr/bin/env node

const fs = require("fs")

function combine({
	filepaths,
	combined,
}) {
	let jsons = []
	for (const f of filepaths) {
		const json = JSON.parse(fs.readFileSync(f, { encoding: "utf-8" }))
		jsons.push(json)
	}

	jsons = jsons.flat()
	fs.writeFileSync(combined, JSON.stringify(jsons, null, 2), { encoding: "utf-8" })
}

if (!module.parent) {
	process.argv.splice(0, 2)
	const filepaths = (process.argv[0] || "").split(",")
	const combined = (process.argv[1] || "combined.json")

	combine({
		filepaths,
		combined
	})
}
```

teamify-prep.js:

```js
#!/usr/bin/env node

const fs = require("fs")

function teamifyPrep() {
	const json = JSON.parse(fs.readFileSync("combined.json", { encoding: "utf-8" }))

	const newJson = json.map(t => ({
			fullname: t.full_name,
			email: t.email,
			team: t.tribe_name,
		})
	)

	fs.writeFileSync("teams.json", JSON.stringify(newJson, null, 2), { encoding: "utf-8" })
}

if (!module.parent) {
	teamifyPrep()
}
```

