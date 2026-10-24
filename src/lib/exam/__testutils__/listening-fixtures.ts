/**
 * 听力的测试题（原创稿子，不取自任何真题录音）：只给单测和 e2e 的模拟大模型用，App 里不内置。
 * 形状就是 schemas.ts 的生成 payload，单测里用 GENERATION_SCHEMAS 校验。
 */
import type { ListeningQuestionType } from '../listening';
import type { GeneratedPayloadOf } from '../schemas';

/** 长对话：一男一女，4 题 */
export const DEMO_LONG_CONVERSATION: GeneratedPayloadOf<'long_conversation'> = {
  topic: 'choosing a summer internship',
  roles: [
    { id: 'W', name: 'Woman', gender: 'female' },
    { id: 'M', name: 'Man', gender: 'male' },
  ],
  script: [
    {
      speaker: 'W',
      text: 'Hi Tom, you look tired. Have you been up late again working on those internship applications?',
    },
    {
      speaker: 'M',
      text: 'I have. I finally got two offers, and now I honestly cannot decide which one to accept. The deadline for both is this Friday.',
    },
    {
      speaker: 'W',
      text: 'Congratulations! That is a nice problem to have. What are the two companies?',
    },
    {
      speaker: 'M',
      text: 'One is a large bank in the city centre. The pay is excellent and the name would look great on my résumé. The other is a small start-up that builds software for local farmers.',
    },
    {
      speaker: 'W',
      text: 'Those sound very different. What would you actually be doing at each place?',
    },
    {
      speaker: 'M',
      text: 'At the bank, I would mostly prepare reports and check data for a senior analyst. At the start-up, they want me to talk to farmers, find out what problems they have, and help design new features.',
    },
    {
      speaker: 'W',
      text: 'Well, which job matches what you want to do after you graduate? That usually matters more than the salary for a three-month internship.',
    },
    {
      speaker: 'M',
      text: 'That is the thing. I have always wanted to work on products that people use every day. But my parents think the bank is the safer choice, and they keep reminding me how competitive the job market is.',
    },
    {
      speaker: 'W',
      text: 'I understand their worry. But a start-up often lets interns take on real responsibility, and you would learn skills that are hard to pick up in a big organisation. Could you ask the start-up whether they would write you a reference at the end?',
    },
    {
      speaker: 'M',
      text: 'That is a good idea. I will also ask whether I could visit a few farms with the team. If they say yes, I think I will accept their offer and explain my reasons to my parents this weekend.',
    },
  ],
  questions: [
    {
      stem: 'Why does the man look tired?',
      options: [
        'He has been preparing for a final exam.',
        'He has been working on internship applications.',
        'He has been helping his parents on a farm.',
        'He has been writing software late at night.',
      ],
      answer: 'B',
      explanation: '男士开头确认自己熬夜写实习申请，B 正确。',
    },
    {
      stem: 'What would the man mainly do at the bank?',
      options: [
        'Meet customers in the city centre.',
        'Design new features for an app.',
        'Prepare reports and check data.',
        'Train junior analysts.',
      ],
      answer: 'C',
      explanation: '原文说在银行主要是 prepare reports and check data，C 正确。',
    },
    {
      stem: 'What does the woman think matters most when choosing an internship?',
      options: [
        'How much the internship pays.',
        'How famous the company is.',
        'What the man’s parents prefer.',
        'Whether it fits his future career plans.',
      ],
      answer: 'D',
      explanation: '女士说和毕业后想做的事是否匹配比工资更重要，D 正确。',
    },
    {
      stem: 'What will the man probably do next?',
      options: [
        'Ask the start-up about a reference and farm visits.',
        'Accept the offer from the bank immediately.',
        'Ask both companies to extend the deadline.',
        'Look for a third internship.',
      ],
      answer: 'A',
      explanation: '男士最后说会问推荐信和能否跟团队去农场，A 正确。',
    },
  ],
};

/** 听力篇章：一人朗读，3 题 */
export const DEMO_PASSAGE: GeneratedPayloadOf<'passage'> = {
  topic: 'a library that lends tools',
  roles: [{ id: 'N', name: 'Narrator', gender: 'male' }],
  script: [
    {
      speaker: 'N',
      text: 'In a quiet neighbourhood on the edge of the city, the public library has started lending something unusual: tools. Alongside novels and travel guides, residents can now borrow electric drills, ladders, sewing machines and even a pressure washer, all free of charge with an ordinary library card.',
    },
    {
      speaker: 'N',
      text: 'The idea came from a librarian who noticed that many visitors were asking where they could find equipment for small repairs. Most people, she realised, use a drill for only a few minutes a year, yet almost every household buys one. By sharing tools, the library hopes to save residents money and reduce the number of rarely used items that end up in landfill.',
    },
    {
      speaker: 'N',
      text: 'The service has proved more popular than expected. In its first six months, the library lent out more than two thousand tools, and volunteers now run weekend workshops that teach basic skills such as fixing a bicycle or repairing a chair. Organisers say the biggest surprise has been social rather than practical: neighbours who borrow the same tools have begun to share advice, and some have formed a repair club that meets every month.',
    },
  ],
  questions: [
    {
      stem: 'What has the library recently started to do?',
      options: [
        'Sell second-hand furniture.',
        'Lend tools to residents.',
        'Offer free bicycles.',
        'Open on weekends only.',
      ],
      answer: 'B',
      explanation: '第一段说图书馆开始外借工具，B 正确。',
    },
    {
      stem: 'Why did the librarian come up with the idea?',
      options: [
        'Visitors often asked where to find repair equipment.',
        'The library had too many old books.',
        'Local shops had stopped selling tools.',
        'The city asked libraries to raise money.',
      ],
      answer: 'A',
      explanation: '第二段说很多读者问哪里能找到修理工具，A 正确。',
    },
    {
      stem: 'What has surprised the organisers most?',
      options: [
        'The high cost of repairing tools.',
        'The number of tools that were lost.',
        'The way the service has brought neighbours together.',
        'The lack of interest in the workshops.',
      ],
      answer: 'C',
      explanation: '最后一段说最大的惊喜是社交方面的，邻居们开始交流、组成修理俱乐部，C 正确。',
    },
  ],
};

/** 讲座：一位讲者，4 题 */
export const DEMO_LECTURE: GeneratedPayloadOf<'lecture'> = {
  topic: 'why we forget what we read',
  roles: [{ id: 'L', name: 'Professor Hayes', gender: 'female' }],
  script: [
    {
      speaker: 'L',
      text: 'Good morning, everyone. Thank you for coming along so early. Today I want to talk about a problem that almost every student in this room probably recognises. You read a chapter carefully, you understand every page, and yet a week later you can remember almost nothing. Why does this happen, and what can we do about it?',
    },
    {
      speaker: 'L',
      text: 'The first reason is that understanding and remembering are not the same thing. When we read, the text is in front of us, so everything feels familiar. Psychologists call this the illusion of knowing. Because the information is easy to recognise, we assume it is stored in memory, but recognising something is much easier than recalling it without help.',
    },
    {
      speaker: 'L',
      text: 'The second reason is the way memory fades over time. Research going back more than a century shows that we lose a large part of new information within the first few days, unless we return to it. Each time we review the material, however, the rate of forgetting slows down. In other words, a short review spread over several days is far more effective than one long session the night before an exam.',
    },
    {
      speaker: 'L',
      text: 'So what should you do? My main advice is to test yourself. After reading a section, close the book and try to write down the key ideas from memory. This feels harder than rereading, and it is supposed to. That effort is exactly what makes the memory stronger. Next week, we will look at how to plan these reviews so that they fit into a busy timetable.',
    },
  ],
  questions: [
    {
      stem: 'What problem does the speaker focus on?',
      options: [
        'Students reading too slowly.',
        'Students choosing the wrong textbooks.',
        'Students missing too many lectures.',
        'Students forgetting what they have read.',
      ],
      answer: 'D',
      explanation: '开头提出读懂了却很快忘掉的问题，D 正确。',
    },
    {
      stem: 'What does the speaker say about the illusion of knowing?',
      options: [
        'It is caused by reading too fast.',
        'It makes recognising feel like remembering.',
        'It only affects younger students.',
        'It can be avoided by reading aloud.',
      ],
      answer: 'B',
      explanation: '讲者说因为容易认出，我们误以为已经记住了，B 正确。',
    },
    {
      stem: 'According to the speaker, what slows down forgetting?',
      options: [
        'Reviewing the material several times.',
        'Studying late the night before an exam.',
        'Reading each chapter twice in one day.',
        'Taking longer breaks between lectures.',
      ],
      answer: 'A',
      explanation: '每复习一次遗忘速度都会变慢，分散复习更有效，A 正确。',
    },
    {
      stem: 'What will the speaker talk about next week?',
      options: [
        'How to choose a quiet place to study.',
        'How to read difficult academic texts.',
        'How to plan reviews in a busy timetable.',
        'How memory changes as people get older.',
      ],
      answer: 'C',
      explanation: '结尾说下周讲怎样把复习安排进忙碌的日程，C 正确。',
    },
  ],
};

export const DEMO_LISTENING: { [T in ListeningQuestionType]: GeneratedPayloadOf<T> } = {
  long_conversation: DEMO_LONG_CONVERSATION,
  passage: DEMO_PASSAGE,
  lecture: DEMO_LECTURE,
};

const LONG_WORD = 'Supercalifragilisticexpialidociousnessandthensomemorewithoutbreaks';

/** 压测：超长称呼、超长单词、长题干和长选项（仍然符合 schema） */
export const STRESS_LECTURE: GeneratedPayloadOf<'lecture'> = {
  ...DEMO_LECTURE,
  roles: [
    {
      id: 'L',
      name: 'Professor Maximiliana Wolfeschlegelsteinhausen',
      gender: 'female',
    },
  ],
  script: DEMO_LECTURE.script.map((s, i) =>
    i === 0 ? { ...s, text: `${s.text} ${LONG_WORD} is a word nobody can break.` } : s,
  ),
  questions: DEMO_LECTURE.questions.map((q, i) =>
    i === 0
      ? {
          ...q,
          stem: `${q.stem} ${LONG_WORD}`,
          options: [`${q.options[0]} ${LONG_WORD}`, q.options[1], q.options[2], q.options[3]],
        }
      : q,
  ),
};
