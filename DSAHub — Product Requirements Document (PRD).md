# DSAHub — Product Requirements Document (PRD)

**Product Name:** DSAHub  
**Working Tagline:** Automatically sync, organize, and showcase your DSA journey.  
**Platform:** Google Chrome Extension  
**Manifest:** Chrome Manifest V3  
**Primary Platforms:** LeetCode + GeeksforGeeks  
**Primary Integration:** GitHub  
**Authentication:** GitHub OAuth  
**Target Users:** Students, competitive programmers, DSA learners, developers, and anyone building a public DSA portfolio.

---

# 1. Product Overview

DSAHub is a Chrome extension that automatically synchronizes accepted coding-problem solutions from **LeetCode and GeeksforGeeks** to a user's GitHub repository.

The core experience is:

```text
Solve Problem
      ↓
Submit
      ↓
Accepted
      ↓
DSAHub detects submission
      ↓
Extract solution + metadata
      ↓
Identify platform
      ↓
Categorize problem
      ↓
Check for duplicate
      ↓
Sync to GitHub
      ↓
Update README
      ↓
✓ Complete
```

After the initial GitHub setup, the user should not need to manually:

- Copy code
- Create folders
- Rename files
- Add problem metadata
- Categorize problems
- Update README
- Commit changes
- Push changes

The goal is to make GitHub synchronization effectively invisible.

---

# 2. Product Vision

DSAHub should become a **unified GitHub-based DSA portfolio and knowledge base**.

Instead of maintaining separate repositories for:

```text
LeetCode
GeeksforGeeks
```

the user can maintain one organized repository:

```text
DSA-Solutions
```

containing solutions from both platforms.

The repository should automatically provide:

- Problem solutions
- Problem metadata
- DSA categories
- Difficulty tracking
- Platform tracking
- Language tracking
- Progress statistics
- Searchable problem index
- Automatically maintained README

The product should feel like:

> **LeetHub + GFG synchronization + automated DSA portfolio/dashboard.**

---

# 3. Problem Statement

Students frequently solve hundreds of DSA problems across different platforms but their solutions remain scattered.

Typical workflow:

```text
Solve on LeetCode
↓
Maybe save code somewhere

Solve on GFG
↓
Maybe save code somewhere

Later:
↓
Manually organize GitHub
↓
Create folders
↓
Update README
↓
Track categories
```

This becomes increasingly difficult as the number of solved problems grows.

DSAHub solves this by automatically converting accepted submissions into an organized GitHub knowledge base.

---

# 4. Core Product Principle

The core principle is:

> **Solve → Submit → Accepted → Automatically organized on GitHub.**

The user should not have to think about synchronization.

---

# 5. Product Goals

## Primary Goals

DSAHub must:

1. Support both LeetCode and GeeksforGeeks.
2. Automatically detect accepted submissions.
3. Extract the submitted solution.
4. Extract problem metadata.
5. Automatically categorize problems.
6. Detect duplicates.
7. Create organized GitHub files/folders.
8. Automatically maintain the repository README.
9. Track solved-problem statistics.
10. Provide a simple extension dashboard.
11. Keep user data local wherever possible.
12. Use a modular architecture that allows future coding platforms.

---

# 6. Non-Goals for MVP

The following should NOT block MVP:

- AI-generated explanations
- AI-powered categorization
- Code optimization
- Code review
- Automatic solution generation
- Multiple GitHub accounts
- Code execution
- Social networking
- Leaderboards
- Backend analytics
- Cloud database
- Mobile application

These may be considered for future versions.

---

# 7. Supported Platforms

## MVP

### LeetCode

Supported URLs should include current problem-page formats such as:

```text
https://leetcode.com/problems/...
```

The implementation must not depend on a single fragile DOM selector.

---

### GeeksforGeeks

Supported URLs should include current problem-page formats such as:

```text
https://www.geeksforgeeks.org/problems/...
```

The implementation must not depend on a single fragile DOM selector.

---

# 8. Platform Adapter Architecture

Platform-specific logic must be isolated.

The application should NOT contain scattered LeetCode/GFG-specific logic.

Create a common interface:

```typescript
interface CodingPlatformAdapter {
    canHandle(url: string): boolean;

    getProblemMetadata(): Promise<ProblemMetadata>;

    getSubmissionStatus(): Promise<SubmissionStatus>;

    getSubmittedSolution(): Promise<Solution>;
}
```

Implement:

```text
LeetCodeAdapter
GFGAdapter
```

Future adapters can be added:

```text
CodeChefAdapter
CodeforcesAdapter
HackerRankAdapter
```

without rewriting the GitHub synchronization system.

---

# 9. Unified Problem Model

Regardless of platform, every problem should be converted into a normalized internal structure.

Example:

```typescript
interface Problem {
    platform: "leetcode" | "gfg";
    problemId?: string;
    slug?: string;
    title: string;
    url: string;
    difficulty?: "Easy" | "Medium" | "Hard";
    topics: string[];
    primaryCategory?: string;
    language: string;
    code: string;
    solvedAt: string;
}
```

The rest of the application should operate on this normalized model.

---

# 10. First-Time User Journey

When the user installs DSAHub:

```text
┌──────────────────────────────┐
│            DSAHub            │
│                              │
│ Automatically sync your      │
│ LeetCode & GFG solutions     │
│ to GitHub.                   │
│                              │
│       [Connect GitHub]       │
└──────────────────────────────┘
```

User clicks:

**Connect GitHub**

After authentication:

```text
✓ GitHub Connected

@username

Choose Repository
```

Options:

```text
○ Existing Repository

[Create New Repository]
```

---

# 11. GitHub Repository Setup

The user can:

### Select Existing Repository

Display:

```text
DSA-Solutions
Competitive-Programming
My-DSA
Coding-Journey
```

### Create New Repository

Form:

```text
Repository Name:
DSA-Solutions

Description:
Automatically organized LeetCode and GeeksforGeeks solutions.

Visibility:
○ Public
● Private

[Create Repository]
```

Default repository visibility should be configurable, with **Private** as the safe onboarding default.

---

# 12. Branch Selection

After selecting a repository:

```text
Branch

[ main ▼ ]
```

The extension should retrieve available branches.

Default:

```text
Repository default branch
```

If `main` does not exist, automatically use the repository's configured default branch.

---

# 13. Onboarding Completion

After repository configuration:

```text
✓ You're ready!

DSAHub is connected to:

github.com/username/DSA-Solutions

Supported platforms:

✓ LeetCode
✓ GeeksforGeeks

Now solve a problem and submit it.

Accepted solutions will automatically
appear on GitHub.
```

---

# 14. Submission Detection

Submission detection is one of the most critical components.

The extension must distinguish between:

```text
Accepted
```

and:

```text
Wrong Answer
Runtime Error
Compilation Error
Time Limit Exceeded
Memory Limit Exceeded
```

Only accepted submissions should automatically sync.

Possible detection hierarchy:

### Priority 1

Frontend submission state.

### Priority 2

Application/API/network state where technically and legally appropriate.

### Priority 3

DOM/state monitoring.

### Priority 4

Polling where necessary.

The implementation must be resilient to platform UI changes.

---

# 15. Submission State Machine

The sync engine should use explicit states:

```text
IDLE
 ↓
SUBMISSION_DETECTED
 ↓
CHECKING_RESULT
 ↓
ACCEPTED
 ↓
EXTRACTING
 ↓
CLASSIFYING
 ↓
CHECKING_DUPLICATE
 ↓
SYNCING
 ↓
UPDATING_README
 ↓
COMPLETE
```

Failure states:

```text
SUBMISSION_FAILED
EXTRACTION_FAILED
AUTH_FAILED
GITHUB_FAILED
DUPLICATE
NETWORK_ERROR
RATE_LIMITED
UNKNOWN_ERROR
```

Every state should have a recoverable path where possible.

---

# 16. Solution Extraction

The extension must capture the **actual submitted solution**.

It should not blindly copy visible editor text if that text could differ from the submitted version.

Extraction priority:

```text
1. Submission/application state
2. Platform submission data
3. Editor state
4. DOM extraction
5. Fallback extraction
```

Create:

```text
SolutionExtractor
```

Interface:

```typescript
extractSolution(): Promise<Solution>
```

Return:

```typescript
{
    language,
    code,
    problemTitle,
    problemUrl,
    problemId,
    submittedAt
}
```

---

# 17. Multi-Language Support

The architecture must support languages available on both platforms.

MVP should support at minimum:

```text
C++
Java
Python
JavaScript
```

The language system must be extensible.

Recommended:

```text
languages/
├── cpp.ts
├── java.ts
├── python.ts
└── javascript.ts
```

Language-specific logic should not be scattered throughout the application.

---

# 18. Problem Metadata

The extension should extract:

```text
Platform
Problem ID
Title
Slug
URL
Difficulty
Topics
Tags
Language
Submission timestamp
```

Example:

```json
{
    "platform": "leetcode",
    "problemId": "1",
    "title": "Two Sum",
    "difficulty": "Easy",
    "topics": [
        "Array",
        "Hash Table"
    ],
    "language": "C++"
}
```

If some metadata cannot be retrieved, synchronization should continue whenever possible.

---

# 19. Unified DSA Categorization

DSAHub should categorize problems independently of platform.

Recommended top-level categories:

```text
Arrays
Strings
Linked List
Stack
Queue
Hashing
Sorting
Binary Search
Two Pointers
Sliding Window
Recursion
Backtracking
Trees
Binary Trees
Binary Search Tree
Heap
Priority Queue
Graphs
Greedy
Dynamic Programming
Trie
Bit Manipulation
Math
Matrix
Miscellaneous
```

The taxonomy should be configurable in the future.

---

# 20. Categorization Strategy

Use this priority:

```text
Platform-provided tags
        ↓
Known tag mappings
        ↓
Local classification rules
        ↓
Fallback category
```

Example:

```text
LeetCode:
Sliding Window
        ↓
Arrays / Sliding Window
```

GFG:

```text
Dynamic Programming
        ↓
Dynamic Programming
```

AI categorization should NOT be required for MVP.

---

# 21. Primary Category + Tags

A problem can have multiple topics.

Example:

```text
Problem:
Longest Substring Without Repeating Characters

Primary Category:
Strings

Tags:
- Sliding Window
- Hashing
- Two Pointers
```

The README should use the primary category for organization while retaining all relevant tags.

---

# 22. Repository Structure

Recommended default:

```text
DSA-Solutions/
│
├── README.md
│
├── Arrays/
│   ├── 0001-Two-Sum/
│   │   ├── solution.cpp
│   │   └── README.md
│   │
│   └── 0053-Maximum-Subarray/
│       ├── solution.py
│       └── README.md
│
├── Strings/
│
├── Linked-List/
│
├── Trees/
│
├── Graphs/
│
├── Dynamic-Programming/
│
└── Miscellaneous/
```

The platform should be stored in problem metadata rather than forcing separate top-level platform folders.

---

# 23. Problem Folder Naming

Default:

```text
<Problem_ID>-<Problem_Title>
```

Example:

```text
0001-Two-Sum
```

For GFG problems without a stable numeric ID:

```text
two-sum
```

Problem titles must be sanitized.

Remove or replace:

```text
/
\
:
?
*
<
>
|
"
```

Folder names should have a reasonable maximum length.

---

# 24. File Naming

Default:

```text
solution.cpp
solution.java
solution.py
solution.js
```

Optional settings:

```text
solution.<ext>
problem-name.<ext>
main.<ext>
```

Default:

```text
solution.<ext>
```

---

# 25. Per-Problem README

Each solution can have its own README.

Example:

```markdown
# Two Sum

**Platform:** LeetCode

**Difficulty:** Easy

**Topics:**
- Array
- Hash Table

## Problem

[View Problem](https://leetcode.com/problems/two-sum/)

## Language

C++

## Solution

See `solution.cpp`.
```

For GFG:

```markdown
# Two Sum

**Platform:** GeeksforGeeks

**Difficulty:** Easy

**Topics:**
- Arrays
- Hashing

## Problem

[View Problem](GFG_URL)

## Language

Java

## Solution

See `solution.java`.
```

MVP should generate this deterministically.

---

# 26. Main README — Core Product Feature

The main README is a central feature of DSAHub.

It should automatically maintain a professional DSA dashboard.

Example:

```markdown
# 🚀 DSA Solutions

Automatically synced using DSAHub.

<!-- DSAHUB:START -->

## 📊 Progress

| Platform | Solved |
|----------|-------:|
| LeetCode | 142 |
| GeeksforGeeks | 87 |
| **Total** | **229** |

## 🧠 By Difficulty

| Difficulty | Problems |
|------------|---------:|
| Easy | 91 |
| Medium | 108 |
| Hard | 30 |

## 📚 By Topic

| Topic | Problems |
|-------|---------:|
| Arrays | 42 |
| Strings | 27 |
| Trees | 31 |
| Graphs | 22 |
| Dynamic Programming | 35 |

## 🟦 LeetCode

| # | Problem | Difficulty | Topic | Language |
|---|---------|------------|-------|----------|
| 1 | Two Sum | Easy | Arrays | C++ |
| 2 | 3Sum | Medium | Arrays | Java |

## 🟩 GeeksforGeeks

| # | Problem | Difficulty | Topic | Language |
|---|---------|------------|-------|----------|
| 1 | Two Sum | Easy | Arrays | C++ |
| 2 | Binary Tree Traversal | Medium | Trees | Python |

<!-- DSAHUB:END -->
```

This README should be the user's **automatically generated DSA portfolio dashboard**.

---

# 27. README Managed Section

DSAHub must never overwrite the user's complete README.

Use:

```markdown
<!-- DSAHUB:START -->

Generated content.

<!-- DSAHUB:END -->
```

Only content between these markers may be modified automatically.

If the repository does not contain the markers:

```text
DSAHub can add a managed section
to your README.

[Add DSAHub Section]
```

User-written content outside the managed section must remain untouched.

---

# 28. README Statistics

The README should automatically calculate:

### Overall

```text
Total Solved
```

### Platform

```text
LeetCode
GeeksforGeeks
```

### Difficulty

```text
Easy
Medium
Hard
```

### Topic

```text
Arrays
Strings
Trees
Graphs
DP
etc.
```

### Language

```text
C++
Java
Python
JavaScript
```

Example:

```text
Language Distribution

C++        104
Java        63
Python      51
JavaScript  11
```

---

# 29. README Problem Index

The generated README should provide searchable problem tables.

Example:

```markdown
## Problems

| # | Problem | Platform | Difficulty | Category | Language |
|---|---------|----------|------------|----------|----------|
| 1 | Two Sum | LeetCode | Easy | Arrays | C++ |
| 2 | 3Sum | LeetCode | Medium | Arrays | Java |
| 3 | Binary Tree Traversal | GFG | Medium | Trees | Python |
```

Problem names should link directly to the problem or GitHub solution as appropriate.

---

# 30. Difficulty Representation

Use standardized internal values:

```text
Easy
Medium
Hard
```

Map platform-specific difficulty values into these values.

If difficulty is unavailable:

```text
Unknown
```

Do not invent difficulty.

---

# 31. Platform Identification

Every problem must retain:

```text
leetcode
```

or:

```text
gfg
```

This must be reflected in:

- Problem metadata
- README
- Sync history
- UI
- Statistics

---

# 32. Duplicate Detection

A problem's identity should be platform-aware.

Do NOT treat:

```text
LeetCode Two Sum
```

and:

```text
GFG Two Sum
```

as automatically identical.

Use:

```text
platform + problemId/slug
```

Example:

```text
leetcode:1
gfg:two-sum
```

are separate records.

Before syncing, check:

1. Local sync history
2. Existing GitHub path
3. Platform
4. Problem ID
5. Canonical URL
6. Problem slug

---

# 33. Re-solving a Problem

If a problem already exists, settings should control behavior:

```text
○ Update existing solution
○ Ignore
○ Ask me
```

Default:

```text
Update existing solution
```

Git history will preserve previous versions.

A new commit should be created when an existing solution is intentionally updated.

---

# 34. GitHub Integration

Create a dedicated abstraction:

```text
GitHubClient
```

Responsibilities:

```text
getUser()
getRepositories()
createRepository()
getRepository()
getBranches()
getFile()
createFile()
updateFile()
```

Raw GitHub API calls must not be scattered across UI components or platform adapters.

---

# 35. Authentication

Use GitHub OAuth.

Do not make Personal Access Token entry the primary onboarding experience.

Flow:

```text
User
 ↓
DSAHub
 ↓
GitHub OAuth
 ↓
User authorization
 ↓
Authenticated session
 ↓
Repository access
```

The exact implementation must follow GitHub's current OAuth requirements and Chrome extension capabilities at development time.

---

# 36. GitHub Permissions

Request the minimum permissions necessary.

The implementation must document:

```text
Permission
Purpose
Data accessed
Reason required
```

Avoid broad access where narrower access is sufficient.

---

# 37. Token Security

Authentication credentials must never be:

- Hardcoded
- Logged
- Uploaded to GitHub
- Sent to an unnecessary backend
- Stored in plaintext outside extension storage

Use appropriate Chrome extension storage mechanisms.

---

# 38. Local-First Architecture

MVP should not require a backend.

Preferred:

```text
LeetCode
     │
GFG  │
     ▼
DSAHub Extension
     │
     ├── Local Settings
     ├── Local Sync History
     └── Local Queue
     │
     ▼
GitHub API
```

No central database is required.

This reduces:

- Infrastructure
- Cost
- Privacy risk
- Maintenance

---

# 39. Extension Architecture

Recommended:

```text
dsahub/
│
├── src/
│   │
│   ├── background/
│   │   └── service-worker.ts
│   │
│   ├── content/
│   │   └── content.ts
│   │
│   ├── platforms/
│   │   ├── core/
│   │   │   ├── adapter.ts
│   │   │   └── types.ts
│   │   │
│   │   ├── leetcode/
│   │   │   ├── adapter.ts
│   │   │   ├── detector.ts
│   │   │   ├── submission.ts
│   │   │   ├── extractor.ts
│   │   │   ├── metadata.ts
│   │   │   └── selectors.ts
│   │   │
│   │   └── gfg/
│   │       ├── adapter.ts
│   │       ├── detector.ts
│   │       ├── submission.ts
│   │       ├── extractor.ts
│   │       ├── metadata.ts
│   │       └── selectors.ts
│   │
│   ├── github/
│   │   ├── auth.ts
│   │   ├── client.ts
│   │   └── repository.ts
│   │
│   ├── sync/
│   │   ├── sync-manager.ts
│   │   ├── queue.ts
│   │   ├── duplicate-detector.ts
│   │   └── retry-manager.ts
│   │
│   ├── categorization/
│   │   ├── categories.ts
│   │   ├── mappings.ts
│   │   └── classifier.ts
│   │
│   ├── readme/
│   │   ├── generator.ts
│   │   ├── parser.ts
│   │   └── statistics.ts
│   │
│   ├── storage/
│   │   └── storage.ts
│   │
│   ├── popup/
│   │   ├── Popup.tsx
│   │   └── components/
│   │
│   ├── options/
│   │   └── Options.tsx
│   │
│   └── utils/
│
├── public/
│   └── icons/
│
├── manifest.json
├── package.json
├── vite.config.ts
└── README.md
```

---

# 40. Chrome Extension Components

## Content Script

Runs on supported coding platforms.

Responsibilities:

- Identify platform
- Detect problem page
- Monitor submission
- Extract problem data
- Extract submitted solution
- Communicate with background service worker

It must not handle GitHub authentication directly.

---

## Background Service Worker

Responsibilities:

- GitHub authentication
- GitHub API communication
- Sync orchestration
- Queue
- Retry system
- Notifications
- Local storage
- README generation coordination

---

## Popup

Responsibilities:

- GitHub status
- Repository
- Statistics
- Recent syncs
- Current platform
- Settings access

---

## Options Page

Settings:

```text
GitHub Account
Repository
Branch
Auto Sync
Folder Naming
File Naming
README Updates
Problem READMEs
Duplicate Handling
Notifications
```

---

# 41. Popup Dashboard

Example:

```text
┌───────────────────────────────┐
│            DSAHub             │
│                               │
│ ● GitHub Connected            │
│                               │
│ DSA-Solutions                 │
│ github.com/user/DSA-Solutions │
│                               │
│ ───────────────────────────── │
│                               │
│        📊 Progress            │
│                               │
│ LeetCode             142      │
│ GeeksforGeeks         87      │
│ ───────────────────────────── │
│ Total                229      │
│                               │
│ Recent Syncs                  │
│                               │
│ ✓ Two Sum            LC       │
│ ✓ Binary Tree        GFG      │
│ ✓ 3Sum               LC       │
│                               │
│ [Open GitHub]                │
│ [Settings]                   │
└───────────────────────────────┘
```

---

# 42. Sync Status UI

During synchronization:

```text
Accepted ✓

Extracting solution...
        ↓
Reading metadata...
        ↓
Categorizing...
        ↓
Checking GitHub...
        ↓
Uploading...
        ↓
Updating README...
        ↓
✓ Synced successfully
```

Success:

```text
✓ Two Sum synced to GitHub.
```

Failure:

```text
⚠ Could not sync Two Sum.

[Retry]
```

The user should not be unnecessarily interrupted by modals.

---

# 43. Sync History

Store local metadata:

```json
{
    "platform": "leetcode",
    "problemId": "1",
    "problemTitle": "Two Sum",
    "githubPath": "Arrays/0001-Two-Sum",
    "commitSha": "...",
    "timestamp": "...",
    "status": "success"
}
```

Dashboard:

```text
Sync History

229 synced
2 failed
1 pending
```

---

# 44. Offline / Network Failure

If the submission is accepted but GitHub is temporarily unavailable:

```text
Accepted
   ↓
Sync queued
   ↓
Network restored
   ↓
Automatic retry
   ↓
GitHub sync
```

Use a local queue.

Recommended:

```text
Maximum retries: 3
```

with exponential backoff.

---

# 45. Atomic Sync

A single synchronization should logically include:

```text
Solution
Problem README
Main README update
```

The system must handle partial failures.

Example:

```text
Solution uploaded ✓
Problem README uploaded ✓
Main README failed ✗
```

The extension should report:

```text
Partially synced.

Solution uploaded successfully.
README update will be retried.
```

Never report complete success when only part of the operation succeeded.

---

# 46. Commit Strategy

Preferred:

```text
One accepted problem = one logical commit
```

Example:

```text
feat: add LeetCode Two Sum solution
```

or:

```text
feat: add GFG Binary Tree Traversal solution
```

The commit may contain:

```text
solution
problem README
main README update
```

---

# 47. GitHub Rate Limits

The extension must:

- Cache repository metadata
- Avoid unnecessary API requests
- Cache branch information
- Handle rate-limit responses
- Queue operations where necessary
- Retry appropriately

If rate limited:

```text
GitHub API rate limit reached.

Your solution has been queued and will retry later.
```

---

# 48. GFG and LeetCode UI Change Protection

Selectors must be centralized.

Bad:

```javascript
document.querySelector(".random-class");
```

throughout the project.

Good:

```typescript
const LEETCODE_SELECTORS = {
    editor: "...",
    submitButton: "...",
    result: "..."
};
```

and:

```typescript
const GFG_SELECTORS = {
    editor: "...",
    submitButton: "...",
    result: "..."
};
```

Platform-specific extraction logic must remain inside the respective adapter.

If the platform UI changes, only that adapter should require major changes.

---

# 49. Error Handling

Every failure must have a human-readable message.

### GitHub disconnected

```text
GitHub is not connected.

[Connect GitHub]
```

### Repository deleted

```text
Your selected repository could not be found.

[Choose Repository]
```

### Extraction failure

```text
DSAHub detected an accepted submission but could not extract the submitted solution.

[Retry]
```

### Duplicate

```text
This problem is already synced.

[Open Existing Solution]
[Update]
```

### Rate limit

```text
GitHub API rate limit reached.

The sync has been queued.
```

---

# 50. Security Requirements

DSAHub must:

- Use HTTPS for remote communication.
- Protect GitHub authentication credentials.
- Never log authentication tokens.
- Never unnecessarily send source code to third parties.
- Sanitize extracted content.
- Escape Markdown correctly.
- Validate GitHub paths.
- Validate API responses.
- Request minimum permissions.
- Avoid unnecessary backend infrastructure.

---

# 51. Privacy

MVP should follow a local-first model.

Stored locally:

```text
GitHub authentication/session information
User settings
Repository configuration
Sync history
Pending sync queue
```

Solutions should go directly:

```text
Coding Platform
        ↓
DSAHub
        ↓
User's GitHub
```

No central solution database is required.

A privacy policy must accurately describe all data handled by the extension.

---

# 52. Permissions

Only request permissions required for current functionality.

Likely categories:

```text
storage
identity
notifications
```

Host access should be restricted to required websites.

Do NOT request:

```text
<all_urls>
```

unless technically necessary and justified.

---

# 53. Testing Strategy

## Unit Tests

Test:

- URL detection
- Platform detection
- Metadata parsing
- Categorization
- Filename sanitization
- README generation
- README parsing
- Duplicate detection
- GitHub path generation
- Statistics generation

## Integration Tests

Test:

```text
Platform
→ Accepted submission
→ Extraction
→ Normalized problem
→ Categorization
→ GitHub
→ README
```

## Browser Tests

Test:

- Fresh installation
- OAuth
- Existing repository
- New repository
- Public repository
- Private repository
- LeetCode
- GFG
- Multiple languages
- Failed submissions
- Duplicate submissions
- Re-solving
- Network failure
- GitHub rate limits
- Expired authentication

---

# 54. Critical Acceptance Tests

### Test 1 — LeetCode Accepted

```text
Solve LeetCode problem
→ Submit
→ Accepted
→ Solution appears on GitHub
```

### Test 2 — GFG Accepted

```text
Solve GFG problem
→ Submit
→ Accepted
→ Solution appears on GitHub
```

### Test 3 — Failed Submission

```text
Submit incorrect solution
→ No GitHub sync
```

### Test 4 — Duplicate

```text
Solve already synced problem
→ Duplicate detected
```

### Test 5 — README

```text
New problem synced
→ README statistics update
→ Problem appears in correct category
```

### Test 6 — Platform

```text
LeetCode solution
→ LeetCode metadata

GFG solution
→ GFG metadata
```

### Test 7 — User README

```text
Custom README content
→ DSAHub update
→ Custom content remains unchanged
```

### Test 8 — Network Failure

```text
Accepted
→ GitHub unavailable
→ Sync queued
→ Network restored
→ Sync succeeds
```

### Test 9 — Language

```text
C++
Java
Python
JavaScript
```

must generate correct extensions.

### Test 10 — Repository Change

```text
Change repository
→ Future solutions sync to new repository
```

---

# 55. Performance Requirements

After an accepted submission is detected:

```text
Target synchronization time: < 5 seconds
```

under normal network conditions.

The content script must not block the coding platform's UI.

GitHub operations should be handled by the background service worker.

---

# 56. Product UX Principle

DSAHub should feel almost invisible.

Ideal:

```text
User submits
      ↓
Accepted
      ↓
✓ DSAHub
Synced to GitHub
```

No unnecessary configuration should be required after onboarding.

---

# 57. Future Features — Phase 2

## AI Problem Explanation

Automatically generate:

```text
Problem intuition
Approach
Algorithm
Complexity
Edge cases
```

Example:

```markdown
## Approach

We use a hash map to store previously
seen values...
```

AI-generated content should be optional.

---

## AI Categorization

If platform tags are insufficient:

```text
Problem metadata
      ↓
AI classifier
      ↓
DSA category
```

AI should only be used as a fallback.

---

## Advanced Statistics

Add:

```text
Current streak
Longest streak
Problems per week
Problems per month
Difficulty distribution
Topic distribution
Platform distribution
Language distribution
```

---

# 58. Future Platform Support

The architecture should allow:

```text
LeetCode
GeeksforGeeks
CodeChef
Codeforces
HackerRank
```

using:

```typescript
interface CodingPlatformAdapter {
    canHandle(url: string): boolean;
    getProblemMetadata(): Promise<ProblemMetadata>;
    getSubmissionStatus(): Promise<SubmissionStatus>;
    getSubmittedSolution(): Promise<Solution>;
}
```

Future implementation:

```text
LeetCodeAdapter
GFGAdapter
CodeChefAdapter
CodeforcesAdapter
HackerRankAdapter
```

The GitHub and README systems should not need to change.

---

# 59. Future Unified DSA Dashboard

Eventually the extension popup could show:

```text
DSAHub

Total Solved
━━━━━━━━━━━━
229

LeetCode
142

GeeksforGeeks
87

━━━━━━━━━━━━

Topics

Arrays       ███████████ 42
Trees        ████████    31
Strings      ███████     27
Graphs       ██████      22
DP           █████████   35

━━━━━━━━━━━━

🔥 Current Streak
12 days

🏆 Total Commits
229
```

This should remain a future feature and not block MVP.

---

# 60. Recommended Tech Stack

## Extension

```text
TypeScript
React
Vite
Chrome Manifest V3
```

## Styling

```text
Tailwind CSS
```

## Storage

```text
chrome.storage.local
```

## GitHub

```text
GitHub REST API
OAuth
```

## Testing

```text
Vitest
Playwright
```

## Code Quality

```text
ESLint
Prettier
```

---

# 61. Manifest V3

The extension must use Manifest V3.

Base structure:

```json
{
    "manifest_version": 3,
    "name": "DSAHub",
    "version": "1.0.0",
    "description": "Automatically sync LeetCode and GeeksforGeeks solutions to GitHub.",
    "permissions": [
        "storage",
        "identity"
    ],
    "background": {
        "service_worker": "background.js"
    },
    "action": {
        "default_popup": "popup.html"
    },
    "content_scripts": [
        {
            "matches": [
                "https://leetcode.com/*",
                "https://www.geeksforgeeks.org/*"
            ],
            "js": [
                "content.js"
            ]
        }
    ]
}
```

The exact permission and authentication configuration must be finalized during implementation based on current Chrome and GitHub requirements.

---

# 62. Development Milestones

## Milestone 1 — Project Foundation

Implement:

- TypeScript
- React
- Vite
- Manifest V3
- Popup
- Content script
- Service worker
- Storage
- Platform adapter interface

---

## Milestone 2 — LeetCode Adapter

Implement:

- Page detection
- Problem detection
- Metadata extraction
- Accepted detection
- Solution extraction

---

## Milestone 3 — GFG Adapter

Implement:

- Page detection
- Problem detection
- Metadata extraction
- Accepted detection
- Solution extraction

---

## Milestone 4 — GitHub

Implement:

- OAuth
- User identity
- Repository listing
- Repository creation
- Branch selection
- File creation/update

---

## Milestone 5 — Sync Engine

Implement:

```text
Accepted
→ Normalize
→ Categorize
→ Duplicate Check
→ GitHub Sync
```

---

## Milestone 6 — Repository Organization

Implement:

- Categories
- Folder generation
- File naming
- Problem README
- Duplicate handling

---

## Milestone 7 — README Engine

Implement:

- Managed README section
- Platform statistics
- Difficulty statistics
- Topic statistics
- Language statistics
- Problem index

---

## Milestone 8 — Reliability

Implement:

- Retry queue
- Network recovery
- Rate-limit handling
- Error handling
- Sync history
- Logging

---

## Milestone 9 — Production

Implement:

- Icons
- Privacy policy
- Store assets
- Production build
- Chrome Web Store validation
- Final testing

---

# 63. Definition of Done

DSAHub MVP is complete when a new user can:

```text
Install DSAHub
       ↓
Connect GitHub
       ↓
Select/create repository
       ↓
Open LeetCode OR GFG
       ↓
Solve problem
       ↓
Submit
       ↓
Receive Accepted
       ↓
DSAHub detects platform
       ↓
Extracts solution
       ↓
Extracts metadata
       ↓
Categorizes problem
       ↓
Checks duplicate
       ↓
Creates GitHub files
       ↓
Updates README
       ↓
Updates statistics
       ↓
Shows success
```

without manually copying, uploading, organizing, or committing the solution.

---

# 64. Final Product Architecture

```text
                         ┌────────────────────┐
                         │      LeetCode      │
                         └─────────┬──────────┘
                                   │
                                   │
                         ┌─────────▼──────────┐
                         │                    │
                         │      DSAHub        │
                         │ Chrome Extension   │
                         │                    │
                         └─────────┬──────────┘
                                   │
                         ┌─────────▼──────────┐
                         │ Platform Detection │
                         └─────────┬──────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    │                             │
             ┌──────▼───────┐             ┌──────▼───────┐
             │ LeetCode     │             │     GFG      │
             │ Adapter      │             │    Adapter   │
             └──────┬───────┘             └──────┬───────┘
                    │                             │
                    └──────────────┬──────────────┘
                                   │
                         ┌─────────▼─────────┐
                         │ Normalized Problem│
                         └─────────┬─────────┘
                                   │
                         ┌─────────▼─────────┐
                         │   Categorizer     │
                         └─────────┬─────────┘
                                   │
                         ┌─────────▼─────────┐
                         │ Duplicate Detector│
                         └─────────┬─────────┘
                                   │
                         ┌─────────▼─────────┐
                         │   Sync Engine     │
                         └─────────┬─────────┘
                                   │
                         ┌─────────▼─────────┐
                         │    GitHub API     │
                         └─────────┬─────────┘
                                   │
                 ┌─────────────────┴─────────────────┐
                 │                                   │
          ┌──────▼──────┐                    ┌───────▼───────┐
          │   Solution  │                    │    README     │
          │    Files    │                    │    Generator  │
          └─────────────┘                    └───────┬───────┘
                                                    │
                                             ┌──────▼───────┐
                                             │ DSA Dashboard │
                                             │   in README   │
                                             └───────────────┘
```

---

# 65. Product Success Metric

The primary MVP success metric is:

> **A user can connect GitHub once, solve an accepted problem on either LeetCode or GeeksforGeeks, and automatically find the correctly categorized solution and updated DSA dashboard in GitHub without manually copying or organizing anything.**

Secondary success metrics:

```text
Sync success rate
Duplicate detection accuracy
Submission detection accuracy
README update accuracy
GitHub API failure recovery
Platform compatibility
```

---

# 66. Implementation Rules for Claude / Antigravity

The implementation agent MUST follow these rules.

### Rule 1

Build the platform adapter architecture first.

### Rule 2

Do not hardcode LeetCode or GFG logic into the GitHub layer.

### Rule 3

Do not implement the entire project in one pass.

### Rule 4

Complete and test each milestone before moving forward.

### Rule 5

Do not introduce a backend unless technically necessary.

### Rule 6

Do not use AI as an MVP dependency.

### Rule 7

Do not overwrite the user's README.

### Rule 8

Use managed README markers.

### Rule 9

Do not silently duplicate problems.

### Rule 10

Treat platform + problem identity as the duplicate key.

### Rule 11

Keep GFG and LeetCode selectors isolated.

### Rule 12

Do not request unnecessary Chrome permissions.

### Rule 13

Never expose GitHub credentials in logs.

### Rule 14

Do not report a sync as successful if it only partially completed.

### Rule 15

Write tests for every major module.

### Rule 16

After every milestone:

```text
1. Run tests
2. Run lint
3. Run production build
4. Verify extension manually
5. Report completed functionality
6. Report remaining issues
```

---

# 67. Initial Implementation Prompt

The implementation agent should begin with:

> Build DSAHub according to this PRD.
>
> DSAHub is a Chrome Manifest V3 extension that automatically synchronizes accepted solutions from both LeetCode and GeeksforGeeks to a user's GitHub repository.
>
> The most important architectural requirement is that LeetCode and GeeksforGeeks must be implemented as independent platform adapters that produce a common normalized problem/solution model.
>
> Do not build a GFG-specific application and add LeetCode later.
>
> The architecture must be platform-independent from the beginning.
>
> Use TypeScript, React, Vite, and Manifest V3.
>
> The core pipeline must be:
>
> Platform Detection → Platform Adapter → Submission Detection → Solution Extraction → Metadata Extraction → Categorization → Duplicate Detection → GitHub Sync → README Generation.
>
> The README generator is a core feature, not an optional enhancement. It must maintain a managed DSA dashboard containing platform statistics, difficulty statistics, topic statistics, language statistics, and categorized problem tables.
>
> Use:
>
> `<!-- DSAHUB:START -->`
>
> and
>
> `<!-- DSAHUB:END -->`
>
> to ensure user-written README content is never overwritten.
>
> Do not introduce a backend for MVP.
>
> Do not depend on AI for categorization.
>
> Use GitHub OAuth rather than making users manually enter a Personal Access Token.
>
> Keep GitHub integration completely independent from LeetCode/GFG scraping logic.
>
> Build the project milestone by milestone.
>
> Start with the extension foundation and platform adapter architecture.
>
> Then implement LeetCode.
>
> Then implement GeeksforGeeks.
>
> Then GitHub integration.
>
> Then the sync engine.
>
> Then categorization.
>
> Then README generation.
>
> Then reliability and production hardening.
>
> Do not move to the next milestone until the current milestone builds and its tests pass.
>
> At every milestone, report:
>
> - What was implemented
> - Files created/changed
> - Tests completed
> - Known limitations
> - What will be implemented next
>
> The final result must be a production-ready Chrome extension capable of synchronizing accepted LeetCode and GeeksforGeeks solutions into one organized GitHub DSA repository.

---

# 68. Final Product Vision

DSAHub should ultimately make this workflow completely automatic:

```text
             LEETCODE
                 │
                 │
             Accepted
                 │
                 ▼
             ┌───────┐
             │       │
             │DSAHub │
             │       │
             └───┬───┘
                 │
                 │
             GFG │
                 │
             Accepted
                 │
                 ▼
        ┌──────────────────┐
        │ Unified DSA Model │
        └─────────┬────────┘
                  │
          ┌───────▼────────┐
          │ Categorization │
          └───────┬────────┘
                  │
          ┌───────▼────────┐
          │ Duplicate Check│
          └───────┬────────┘
                  │
          ┌───────▼────────┐
          │  GitHub Sync   │
          └───────┬────────┘
                  │
        ┌─────────┴──────────┐
        ▼                    ▼
   Solution Files        README
                             │
                             ▼
                   ┌─────────────────┐
                   │ DSA Dashboard   │
                   │                 │
                   │ 229 Solved      │
                   │                 │
                   │ Arrays     42   │
                   │ Trees      31   │
                   │ Graphs     22   │
                   │ DP         35   │
                   │                 │
                   │ LC        142   │
                   │ GFG        87   │
                   └─────────────────┘
```

**The core positioning should be:**

> **DSAHub — Automatically turn your LeetCode and GeeksforGeeks progress into an organized GitHub DSA portfolio.**