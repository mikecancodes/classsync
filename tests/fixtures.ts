import { AcademicState, offsetDate, stateSchema } from '../src/lib/model';

export function testState(): AcademicState {
  const categories = [
    { name: 'Assignments', weight: 30 }, { name: 'Quizzes', weight: 15 },
    { name: 'Midterm', weight: 25 }, { name: 'Final', weight: 30 },
  ];
  const definitions = [
    ['demo-networks', 'CS 310', 'Computer Networks', 'Dr. Maya Patel', 'blue'],
    ['cs201', 'CS 201', 'Data Structures', 'Dr. Sarah Chen', 'purple'],
    ['demo-justice', 'CJ 101', 'Criminal Justice', 'Prof. Jordan Ellis', 'green'],
    ['demo-architecture', 'CS 250', 'Computer Architecture', 'Dr. James Wilson', 'orange'],
    ['demo-algorithms', 'CS 330', 'Algorithm Analysis', 'Dr. Elena Rivera', 'blue'],
  ] as const;
  const courses = definitions.map(([id, code, name, professor, color]) => ({
    id, code, name, professor, color, categories,
    schedule: 'See your syllabus for meeting times',
    syllabus: `${name}\nAssignments 30%\nQuizzes 15%\nMidterm 25%\nFinal 30%\nDemo syllabus. Confirm your actual grading policy with your instructor.`,
  }));
  const titles = ['Socket Programming Lab', 'Priority Queue Assignment', 'Chapter 5 Quiz', 'Cache Memory Discussion', 'Algorithm Analysis Homework'];
  const assignments = courses.map((c, i) => ({
    id: `demo-work-${c.id}`, courseId: c.id, title: titles[i], due: offsetDate(i + 1),
    status: i === 0 ? 'progress' : 'todo', category: i === 2 ? 'Quizzes' : 'Assignments',
    points: 100, earned: null, description: 'Demo coursework. Review your notes, complete the practice problems, and explain your reasoning.',
  }));
  const notes = [
    'TCP provides a reliable ordered byte stream. UDP sends independent datagrams without guaranteeing delivery. Sockets identify communication endpoints using addresses and ports.',
    'A priority queue retrieves the highest-priority item. Binary heaps support insertion and removal in O(log n), and peeking in O(1). Test duplicate priorities and empty queues.',
    'The justice system includes law enforcement, courts, and corrections. Due process protects fair treatment. Compare the responsibilities of each institution using course examples.',
    'Caches exploit temporal and spatial locality. A cache hit retrieves data from a faster level. Compare direct-mapped and set-associative designs and account for miss penalties.',
    'Asymptotic analysis describes how resource use grows with input size. Distinguish worst-case and average-case behavior. State assumptions when comparing algorithms.',
  ];
  return stateSchema.parse({
    version: 2, courses,
    assignments: [...assignments,
      { ...assignments[0], id: 'demo-overdue', title: 'Network Protocols Worksheet', due: offsetDate(-1), status: 'todo' },
      ...courses.map((c, i) => ({ ...assignments[i], id: `demo-graded-${c.id}`, title: 'Foundations checkpoint', status: 'done', due: offsetDate(-5), earned: [92, 94, 88, 90, 96][i] })),
    ],
    materials: courses.map((c, i) => ({ id: `demo-note-${c.id}`, courseId: c.id, kind: 'notes', title: `${c.name} · Key concepts`, text: notes[i] })),
    announcements: courses.slice(0, 3).map((c, i) => ({
      id: `demo-announcement-${c.id}`, courseId: c.id, platform: i % 2 ? 'Canvas' : 'D2L',
      title: ['Lab resources are ready', 'A little help with priority queues', 'Your next quiz: what to review'][i],
      description: ['Review the socket examples in your notes before starting the lab. Bring questions to your next class.', 'Start with the heap operations and test edge cases. Your saved course notes include a quick refresher.', 'Revisit the roles of courts, law enforcement, and corrections. Focus on explaining the differences.'][i],
      priority: ['high', 'low', 'medium'][i], posted: offsetDate(-i), read: false,
    })),
  });
}
