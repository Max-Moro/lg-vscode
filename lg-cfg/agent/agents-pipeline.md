# Pipeline workflow in this project

## Important characteristics of subagents

**Context Isolation**: Each subagent call is a separate session. Agents do not remember previous executions. This saves tokens but requires complete instructions in each prompt.

**Reports - only feedback channel**: The agent returns only the final report. It is impossible to ask clarifying questions after execution.

## Available agents

### Agent: @code-integrator

You are an expensive but intelligent model. You plan architecture well and write code well, but it is quite wasteful to call many operations (Read, Edit, Glob, Grep) during your work to make the final integration of planned changes into the final codebase. It is much more efficient to distribute responsibilities between you and the integration subagent.

You do not need to use tools for editing the final code. Simply write the implementation as a single Markdown document (a single detailed instruction) that can be used by a cheaper (less capable) AI model that already has access to editing the codebase.

Therefore, the final development instruction for the integration subagent (in "Subagent System Prompt") should mainly contain technical implementation details:
- brief business requirements;
- required architectural changes (if needed);
- main and optimal integration points for new functionality;
- new code listings as fenced blocks;
- description of patches (they may be informal but sufficient for understanding by another AI model);
- **when changing public APIs** - explicit listing of ALL files using these functions/types;
- and so on;

The instruction should be written once when launching the tool for working with the @code-integrator agent. Do not duplicate this instruction in the dialog with the user.

After the integration subagent finishes working, it is necessary to:
1. Extract the "Modified Files:" section from its report
2. Pass the file list to the @linter agent in the format:
   ```
   Modified files:
   - path/to/file1.ext
   - path/to/file2.ext
   ```
3. Pass the file list to the @compiler agent with brief comments about the changes made (based on your original plan).

### Agent: @linter

This agent is responsible for calling the linter and fixing problems that arise. It is necessary to pass it a list of modified/created files. 

### Agent: @compiler

This agent is responsible for code compilation and fixing any problems that arise. It is necessary to pass it a list of modified/created files with brief comments about what was changed. This is needed so that the compilation agent makes fixes thoughtfully, rather than simply randomly deleting useful (newly added) functionality.

Comments are formulated by the orchestrator based on the original change plan (for example: "added processDocument method", "updated to use new API").

### Other agents

Currently, this project uses only 3 agents:
- @code-integrator
- @linter
- @compiler

There is no dedicated test agent in the project because at this stage of development all tests are performed manually by the user (visual testing).

## Types of iterations

Depending on the complexity of the task, work on it can be conducted in the following ways.

### Main iterative cycle

#### When to apply

- large refactorings and architecture rework
- changes in 3 or more files
- need for complete rewriting of some existing module
- usually used at the beginning of a dialog when working on a new task or feature

#### Order of work

1. Check the sufficiency of data in the context window obtained from the **Listing Generator** tool. If there is insufficient data to complete the task, stop work and notify the user.
2. Perform initial planning of work on a new feature or new functional block.
3. Create a development instruction and send it to the @code-integrator agent.
4. Perform linting of the modified codebase by calling the @linter agent.
5. Perform compilation of the codebase by calling the @compiler agent.
6. Get all reports from subagents and resolve their problems if they arise.
7. Prepare for the user a final brief summary of the iteration results and send it in the dialog.
8. Complete work and wait for user feedback and/or testing results.

### Short iterative cycle

#### When to apply

- targeted fixes in 2 or fewer files
- local fixing of problems and errors
- usually used when the user continues working in the dialog and provides feedback as a result of testing
- this type of iteration is necessary to conduct accelerated development

#### Order of work

1. To accelerate, make the necessary minimal fixes yourself, without using the @code-integrator agent.
2. **MUST** run the @linter agent for modified files.
3. **MUST** run the @compiler agent to check the build.
4. Get all reports from subagents and resolve their problems if they arise.
5. Quickly respond to the user that the fix is ready for testing (visual verification). A comprehensive summary is not required in this case.

**Important:** Even in a short cycle, linting and compilation checks cannot be skipped. 

### General working rules

Always make a decision based on task complexity regarding which type of iteration to use (main or short).

In any case, do not create summary Markdown documents in the file system on your own initiative: summaries, checklists, reports on work done, etc. All reporting at the end of iterations goes only in the dialog. If as a result of working on a functional block the existing documentation in the repository becomes obviously outdated, do not patch it yourself; simply point out this nuance to the user.

Markdown documentation should be developed only if the user specifically and separately asks for it.

#### Handling escalations from subagents

If a subagent (@linter or @compiler) returns the status "⚠️ Attention Required":

1. Read the "Remaining errors" section in the subagent's report
2. Assess problem complexity:
   - **Simple** (1-2 files, obvious fix) → Fix it yourself via Edit and re-run the subagent
   - **Complex** (requires refactoring, architectural changes) → Stop and notify the user
3. If the problem persists after 2 iterations of fixes → stop and notify the user

#### Using TodoWrite

TodoWrite is used **only by the orchestrator** for planning work on tasks.

Subagents **DO NOT use** TodoWrite — they work according to clear instructions and proceed directly to execution.