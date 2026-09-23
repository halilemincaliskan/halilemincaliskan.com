// All site copy lives here. Components only render this data.

export const profile = {
  name: 'Halil Emin Çalışkan',
  role: 'iOS Developer',
  summary:
    'I build iOS apps with Swift, SwiftUI and UIKit. I care about code that is modular, tested and checked on a real device, not just code that compiles.',
  location: 'Istanbul, Turkey',
  availability: 'Open to new roles: remote or on-site.',
  links: {
    email: 'halilemincaliskan@gmail.com',
    linkedin: 'https://linkedin.com/in/halilecaliskan',
    github: 'https://github.com/halilemincaliskan',
  },
};

export const stats = [
  { value: '20+', label: 'App Store releases shipped' },
  { value: '465+', label: 'XCTest unit tests, written from zero' },
  { value: '0', label: 'SwiftLint violations in strict mode, 500+ files' },
];

export const caseStudy = {
  company: 'BuyBuddy',
  title: 'Rebuilding a production iOS app in SwiftUI',
  context:
    "BuyBuddy's staff app pairs, arms and disarms retail security tags over NFC and Bluetooth LE. The existing app was a large UIKit/VIPER codebase. I rebuilt it from scratch in SwiftUI with MVVM.",
  built: [
    '17 feature modules on top of 3 independent Swift Packages: design system, networking and hardware.',
    'A test suite that grew from 0 to 465+ XCTest unit tests.',
    'Strict SwiftLint with zero violations as the codebase grew past 500 files.',
    'One command, verify.sh, that runs the simulator build, the device build, all tests and lint, and stops at the first failure.',
  ],
  lesson: {
    title: 'The old code is the real spec',
    body: 'The written spec was wrong in several places: endpoints that did not exist, commands that worked differently, a feature that was not what its name said. So every feature started by reading the old app and its SDK and writing down what they actually did. The Bluetooth and NFC protocol was checked byte by byte against the old SDK.',
  },
};

export const workflow = {
  title: 'How I work',
  intro:
    'I use AI coding agents (Claude Code, Codex) every day. Their code is only as good as the checks around it, so most of my effort goes into those checks.',
  steps: [
    {
      name: 'Split the work',
      text: 'Every feature is a written spec with a clear definition of done.',
    },
    {
      name: 'Read the old code first',
      text: 'Find out what the system really does, not what the document says.',
    },
    {
      name: 'Agents implement, I own',
      text: 'Agents write code in isolated branches. Architecture, integration and review stay with me.',
    },
    {
      name: 'One gate',
      text: 'verify.sh must pass: simulator build, device build, tests, strict lint.',
    },
    {
      name: 'Use the app',
      text: 'Drive the running app in the simulator, then test on a real device.',
    },
    {
      name: 'Log decisions',
      text: 'Every product decision made without the product owner goes into a log for review.',
    },
  ],
  story: {
    title: 'Why the device build is part of the gate',
    body: [
      'One feature passed every check: build, 141 tests, lint. On my phone, it did not compile.',
      'The camera code was inside #if !targetEnvironment(simulator), so the simulator build never compiled it at all. Every check had passed over code that was never type-checked.',
      'I added a device build to verify.sh, then tested the gate itself: I reverted the fix, and the simulator build stayed green while the device build failed. The blind spot was real, and now it is closed.',
    ],
  },
  defects: {
    title: 'Bugs the green checks missed',
    note: '42 defects documented across 10 development cycles. A defect is counted only if it was found after build, tests and lint were already green. Some examples:',
    items: [
      'Delete account asked the user to type "SİL". Uppercasing produced a dotless "I" instead of the Turkish "İ", so the button never enabled.',
      'Tag IDs were lowercased before being sent to the server. Against the real backend, every nearby tag would have looked like an unknown product.',
      'A failed Bluetooth pairing showed every step as completed.',
      'Retry after a network error sent the user back to write to a tag that was already disarmed.',
    ],
  },
  notDelegated:
    'What I do not delegate: architecture, protocol verification and product decisions.',
};

export const experience = [
  {
    role: 'iOS Developer',
    company: 'BuyBuddy',
    period: 'Sep 2024 – Present',
    points: [
      'Rebuilt the staff iOS app from scratch in SwiftUI/MVVM (see above).',
      'Developed and maintained features across nearly all modules of a production VIPER/UIKit app, with REST APIs and third-party SDKs.',
      'Shipped and maintained 20+ App Store releases.',
    ],
  },
  {
    role: 'Software Developer',
    company: 'WediaCorp',
    period: 'Jan 2024 – Sep 2024',
    points: [
      'Built a Google index-control automation system in Go with MySQL and a scraping API; about 5x faster processing through concurrency.',
      'Delivered end-to-end web features across backend (Go, PHP, MySQL) and frontend (Vue.js).',
    ],
  },
  {
    role: 'iOS Developer Intern',
    company: 'BuyBuddy',
    period: 'Nov 2023 – Dec 2023',
    points: [
      'Built screens, reusable UI components and REST API data flows in Swift/UIKit with MVVM.',
    ],
  },
  {
    role: 'iOS Developer Intern',
    company: 'Mobillium',
    period: 'Jul 2022 – Aug 2022',
    points: ['Mentor-guided iOS program (Swift, UIKit, MVVM); built a note-taking app.'],
  },
];

export const skills = {
  production: [
    'Swift',
    'SwiftUI',
    'UIKit',
    'MVVM',
    'VIPER',
    'Swift Package Manager',
    'XCTest',
    'SwiftLint',
    'REST APIs',
    'Git',
    'CI/CD',
    'App Store Connect',
    'TestFlight',
    'Claude Code',
    'Codex',
  ],
  alsoUsed: ['Go', 'PHP', 'MySQL', 'Vue.js', 'Node.js'],
};

export const notFound = {
  title: 'Page not found',
  body: 'This page does not exist.',
  home: 'Back to the home page',
};

export const education = {
  degree: 'B.Sc. Computer Engineering',
  school: 'Istanbul University-Cerrahpaşa',
  year: '2023',
};

// "The Build": scrolling the page runs a build. Stage ids must match src/scene/contract.ts.
export const build = {
  stages: [
    {
      id: 'hero',
      label: 'Init',
      terminal: ['$ ./verify.sh --target halil', 'resolving packages...'],
    },
    {
      id: 'stats',
      label: 'Profile',
      terminal: ['reading profile...', '20+ releases · 465+ tests · 0 lint violations'],
    },
    {
      id: 'work',
      label: 'Assemble',
      terminal: [
        'linking DesignSystem, Networking, Hardware',
        '✓ 17 feature modules compiled (simulator)',
      ],
    },
    {
      id: 'workflow',
      label: 'Pipeline',
      terminal: ['spec → old code → agents → gate → device → log', 'owner: halil'],
    },
    {
      id: 'gate',
      label: 'The Gate',
      terminal: [
        '▶ device build (generic/platform=iOS)',
        "✗ error: main actor-isolated property 'onScan' can not be mutated from a nonisolated context",
        '✓ fixed · device build added to verify.sh',
      ],
    },
    {
      id: 'defects',
      label: 'Defects',
      terminal: ['42 defects logged across 10 cycles', '✓ tests passed · ✓ lint: 0 violations'],
    },
    {
      id: 'experience',
      label: 'History',
      terminal: ['$ git log --reverse --oneline', 'mobillium → buybuddy → wediacorp → buybuddy'],
    },
    {
      id: 'contact',
      label: 'Ship',
      terminal: ['** BUILD SUCCEEDED **', '$ open mailto:halilemincaliskan@gmail.com'],
    },
  ],
  // A gate is pending until its failAt/passAt point is reached in scroll order.
  gates: [
    { id: 'sim', label: 'Simulator', passAt: { stage: 'work', t: 0.6 } },
    {
      id: 'device',
      label: 'Device',
      failAt: { stage: 'gate', t: 0.3 },
      passAt: { stage: 'gate', t: 0.75 },
    },
    { id: 'tests', label: 'Tests', passAt: { stage: 'defects', t: 0.5 } },
    { id: 'lint', label: 'Lint', passAt: { stage: 'defects', t: 0.8 } },
  ],
  scrollHint: 'Scroll to run the build',
  successLabel: 'BUILD SUCCEEDED',
  // Drawn on the 3D phone screen; keep it short.
  screen: {
    hero: { title: 'Scroll to run', subtitle: 'verify.sh is ready' },
    work: { eyebrow: '17 modules', title: 'BuyBuddy' },
    workflow: {
      eyebrow: 'Workflow',
      title: 'verify.sh',
      rows: ['Spec', 'Old code', 'Agents', 'Gate', 'Device', 'Log'],
      states: { wait: 'WAIT', run: 'RUN', pass: 'PASS' },
    },
    gate: {
      eyebrow: 'Device gate',
      running: 'Running on device',
      failed: 'Device build failed',
      passed: 'Device build passed',
      errorTitle: 'Build error',
      errorBody: 'Device-only code did not compile.',
      errorHint: 'Fix required before shipping.',
    },
    defects: {
      eyebrow: 'Found after green',
      title: '42 defects',
      items: ['İ ≠ I', 'Tag ID case', 'Pairing status', 'Retry state'],
    },
    experience: {
      eyebrow: 'Experience',
      title: '2022 → now',
    },
    contact: { top: 'BUILD', bottom: 'SUCCEEDED', subtitle: 'Ready to ship' },
  },
} as const;
