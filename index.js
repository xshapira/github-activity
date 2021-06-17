const core = require("@actions/core");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const { Toolkit } = require("actions-toolkit");

const MAX_LINES = 100;

/**
 * Returns the sentence case representation
 * @param {String} str - the string
 *
 * @returns {String}
 */

const capitalize = (str) => str.slice(0, 1).toUpperCase() + str.slice(1);

const urlPrefix = "https://github.com/";

/**
 * Returns a URL in markdown format for PR's and issues
 * @param {Object | String} item - holds information concerning the issue/PR
 *
 * @returns {String}
 */

const toUrlFormat = (item, branch, public = true) => {
 if (typeof item === "object") {
  return Object.hasOwnProperty.call(item.payload, "issue") ? (public ? `[\`#${item.payload.issue.number}\`](${urlPrefix}/${item.repo.name}/issues/${item.payload.issue.number} '${item.payload.issue.title.replace(/'/g, "\\'")}')` : `\`#${item.payload.issue.number}\``) : public ? `[\`#${item.payload.pull_request.number}\`](${urlPrefix}/${item.repo.name}/pull/${item.payload.pull_request.number} '${item.payload.pull_request.title.replace(/'/g, "\\'")}')` : `\`#${item.payload.pull_request.number}\``;
 }
 return !public ? (branch ? `\`${branch}\`` : `<span title="Private Repo">\`🔒${item}\`</span>`) : `[${branch ? `\`${branch}\`` : item}](${urlPrefix}${item}${branch ? `/tree/${branch}` : ""})`;
};

const actionIcon = (name, alt) => `<a href="https://github.com/igorkowalczyk" title="${alt}"><img alt="${alt}" src="https://github.com/igorkowalczykbot/github-activity/raw/master/icons/${name}.png" align="top" height="18"></a>`;

/**
 * Execute shell command
 * @param {String} cmd - root command
 * @param {String[]} args - args to be passed along with
 *
 * @returns {Promise<void>}
 */

const exec = (cmd, args = []) =>
 new Promise((resolve, reject) => {
  const app = spawn(cmd, args, { stdio: "pipe" });
  let stdout = "";
  app.stdout.on("data", (data) => {
   stdout = data;
  });
  app.on("close", (code) => {
   if (code !== 0 && !stdout.includes("nothing to commit")) {
    err = new Error(`Invalid status code: ${code}`);
    err.code = code;
    return reject(err);
   }
   return resolve(code);
  });
  app.on("error", reject);
 });

/**
 * Make a commit
 *
 * @returns {Promise<void>}
 */

const commitFile = async () => {
 await exec("git", ["config", "--global", "user.email", "igor.kowalczyk.bot@onet.pl"]);
 await exec("git", ["config", "--global", "user.name", "IgorKowalczykBot"]);
 await exec("git", ["add", "README.md"]);
 await exec("git", ["commit", "-m", "[Bot] Update README with the recent activity"]);
 await exec("git", ["push"]);
};

const serializers = {
 CommitCommentEvent: (item) => {
  const hash = item.payload.comment.commit_id.slice(0, 7);
  return `${actionIcon("comment", "🗣")} Commented on ${item.public ? `[\`${hash}\`](${item.payload.comment.html_url})` : `\`${hash}\``} in ${toUrlFormat(item.repo.name, null, item.public)}`;
 },
 CreateEvent: (item) => {
  if (item.payload.ref_type === "repository") return `${actionIcon("create-repo", "➕")} Created repository ${toUrlFormat(item.repo.name, null, item.public)}`;
  if (item.payload.ref_type === "branch") return `${actionIcon("create-branch", "📂")} Created branch ${toUrlFormat(item.repo.name, item.payload.ref, item.public)} in ${toUrlFormat(item.repo.name, null, item.public)}`;
 },
 DeleteEvent: (item) => {
  return `${actionIcon("delete", "❌")} Deleted \`${item.payload.ref}\` from ${toUrlFormat(item.repo.name, null, item.public)}`;
 },
 ForkEvent: (item) => {
  return `${actionIcon("fork", "🍴")} Forked ${toUrlFormat(item.repo.name, null, item.public)} to ${toUrlFormat(item.payload.forkee.full_name, null, item.payload.forkee.public)}`;
 },
 IssueCommentEvent: (item) => {
  return `${actionIcon("comment", "🗣")} Commented on ${toUrlFormat(item, null, item.public)} in ${toUrlFormat(item.repo.name, null, item.public)}`;
 },
 IssuesEvent: (item) => {
  return `${actionIcon("issue", "❗️")} ${capitalize(item.payload.action)} issue ${toUrlFormat(item, null, item.public)} in ${toUrlFormat(item.repo.name, null, item.public)}`;
 },
 PullRequestEvent: (item) => {
  const emoji = item.payload.action === "opened" ? actionIcon("pr-open", "✅") : actionIcon("pr-close", "❌");
  const line = item.payload.pull_request.merged ? `${actionIcon("merge", "🎉")} Merged` : `${emoji} ${capitalize(item.payload.action)}`;
  return `${line} PR ${toUrlFormat(item, null, item.public)} in ${toUrlFormat(item.repo.name, null, item.public)}`;
 },
 PullRequestReviewEvent: (item) => {
  return `${actionIcon("review", "🔍")} Reviewed ${toUrlFormat(item, null, item.public)} in ${toUrlFormat(item.repo.name, null, item.public)}`;
 },
 PushEvent: (item) => {
  if (item.repo.name == "IgorKowalczyk/igorkowalczyk") {
   return;
  } else {
   return `${actionIcon("commit", "📝")} Made \`${item.payload.size}\` commit${item.payload.size === 1 ? "" : "s"} in ${toUrlFormat(item.repo.name, null, item.public)}`;
  }
 },
 ReleaseEvent: (item) => {
  return `${actionIcon("release", "🏷")} Released ${item.public ? `[\`${item.payload.release.tag_name}\`](${item.payload.release.html_url})` : `\`${item.payload.release.tag_name}\``} in ${toUrlFormat(item.repo.name, null, item.public)}`;
 },
 WatchEvent: (item) => {
  return `${actionIcon("star", "⭐")} Starred ${toUrlFormat(item.repo.name, null, item.public)}`;
 },
};

const timestamper = (item) => `\`[${item.created_at.split("T")[0].split("-").slice(1, 3).join("/")} ${item.created_at.split("T")[1].split(":").slice(0, 2).join(":")}]\``;

Toolkit.run(
 async (tools) => {
  const GH_USERNAME = core.getInput("USERNAME");

  // Get the user's public events
  tools.log.debug(`Getting activity for ${GH_USERNAME}`);

  let eventArrs = [];
  for (let i = 0; i < 3; i++) {
   eventArrs[i] = await tools.github.activity.listEventsForAuthenticatedUser({
    username: GH_USERNAME,
    per_page: 100,
    page: i + 1,
   });
  }

  // const events = await tools.github.activity.listEventsForAuthenticatedUser({
  // 	username: GH_USERNAME,
  // 	per_page: 100
  // });
  // const events2 = await tools.github.activity.listEventsForAuthenticatedUser({
  // 	username: GH_USERNAME,
  // 	per_page: 100,
  // 	page: 2
  // });

  tools.log.debug(`Activity for ${GH_USERNAME}, ${eventArrs.reduce((a, c) => a + c.data.length, 0)} events found.`);

  const last = (array) => array[array.length - 1];

  let arr = [];

  for (const events of eventArrs) {
   for (const data of events.data) {
    if (arr.length && data.type === "PushEvent" && last(arr).type === "PushEvent" && data.repo.name === last(arr).repo.name) arr[arr.length - 1].payload.size += data.payload.size;
    else arr.push(data);
   }
  }

  const content = arr
   // Filter out any boring activity
   .filter((event) => {
    let r = serializers.hasOwnProperty(event.type);
    if (!r) tools.log.debug(event);
    return r;
   })
   // We only have five lines to work with
   // .slice(0, MAX_LINES)
   // Call the serializer to construct a string
   .map((item) => `${timestamper(item)} ${serializers[item.type](item)}`)
   // Filter out undefined lines
   .filter((item) => !item.match(/^`\[\d{1,2}\/\d{1,2} \d{1,2}:\d{2}]` undefined$/));

  const readmeContent = fs.readFileSync("./README.md", "utf-8").split("\n");

  // Find the index corresponding to <!--START_SECTION:activity--> comment
  let startIdx = readmeContent.findIndex((content) => content.trim() === "<!--START_SECTION:activity-->");

  // Early return in case the <!--START_SECTION:activity--> comment was not found
  if (startIdx === -1) {
   return tools.exit.failure(`Couldn't find the <!--START_SECTION:activity--> comment. Exiting!`);
  }

  // Find the index corresponding to <!--END_SECTION:activity--> comment
  const endIdx = readmeContent.findIndex((content) => content.trim() === "<!--END_SECTION:activity-->");

  if (!content.length) {
   tools.exit.failure("No events found");
  }

  if (content.length < 5) {
   tools.log.info("Found less than 5 activities");
  }

  readmeContent.splice(startIdx + 1, endIdx - startIdx);

  if (startIdx !== -1) {
   // Add one since the content needs to be inserted just after the initial comment
   startIdx++;
   content.forEach((line, idx) => readmeContent.splice(startIdx + idx, 0, `${idx === 10 ? "\n<details><summary>⚡ Show more activity</summary>\n\n" : ""}${line}  ${idx === content.length - 1 ? "\n\n</details>\n<!--END_SECTION:activity-->" : ""}`));

   // // Append <!--END_SECTION:activity--> comment
   // readmeContent.splice(
   //   startIdx + content.length,
   //   0,
   //   "<!--END_SECTION:activity-->"
   // );

   // Update README
   fs.writeFileSync("./README.md", readmeContent.join("\n"));

   // Commit to the remote repository
   try {
    await commitFile();
   } catch (err) {
    tools.log.debug("Something went wrong");
    return tools.exit.failure(err);
   }
   tools.exit.success("Wrote to README");
  }
 },
 {
  event: ["schedule", "workflow_dispatch"],
  secrets: ["GITHUB_TOKEN"],
 }
);
