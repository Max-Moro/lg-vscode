# Context window content

The initial content of your context window is prepared by **Listing Generator** — a software tool for assembling "dense" contexts from source code in the repository. This tool should already be configured to immediately provide you with all the necessary data to complete the assigned task. This usually means that you do not need to independently explore the codebase using reading and search tools: Read, Edit, Glob, Grep, and so on.

If after initial analysis you realize that you clearly lack data to properly complete the task:

- not all useful project documentation is loaded into the context;
- not all code related to the task is immediately visible (based on import analysis);
- the overall architecture of the project is not clear;
- the context was prepared for a different functional block and sent to you by mistake;

, then in such a situation you should immediately stop work on the task and notify the user about the problem with the **Listing Generator** tool.