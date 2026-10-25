// Push notification copy, per language.
//
// A translated reply that arrives under an English notification defeats the
// point, so this is localized too — statically, not through the translation
// model. It is a handful of short strings per language that never change;
// paying for a model call (and its latency, and its failure modes) on every
// push would be absurd.
//
// The sender is deliberately the team, never the individual admin who
// replied: a name on a lock screen is noise to the user, and it leaks who is
// working the queue. The admin's name still appears inside the thread.
//
// Each language owns its whole sentence apart from the subject, and the
// subject strings carry whatever preposition or case the language needs — so
// a template can just slot one in without any grammar of its own.

type QueryType = 'feedback' | 'feature_request' | 'bug_report';

interface PushCopy {
  subjects: Record<QueryType, string>;
  replied: (subject: string) => string;
  /** For the support chat, which has no subject to name. */
  repliedInChat: string;
}

const COPY: Record<string, PushCopy> = {
  en: {
    subjects: {
      feedback: 'to your feedback',
      feature_request: 'to your feature request',
      bug_report: 'to your bug report',
    },
    replied: (subject) => `The support team replied ${subject}`,
    repliedInChat: 'The support team replied',
  },
  es: {
    subjects: {
      feedback: 'a tus comentarios',
      feature_request: 'a tu solicitud de función',
      bug_report: 'a tu informe de error',
    },
    replied: (subject) => `El equipo de soporte respondió ${subject}`,
    repliedInChat: 'El equipo de soporte respondió',
  },
  fr: {
    subjects: {
      feedback: 'à votre retour',
      feature_request: 'à votre demande de fonctionnalité',
      bug_report: 'à votre signalement de bug',
    },
    replied: (subject) => `L'équipe d'assistance a répondu ${subject}`,
    repliedInChat: "L'équipe d'assistance a répondu",
  },
  de: {
    subjects: {
      feedback: 'auf dein Feedback',
      feature_request: 'auf deinen Funktionswunsch',
      bug_report: 'auf deinen Fehlerbericht',
    },
    replied: (subject) => `Das Support-Team hat ${subject} geantwortet`,
    repliedInChat: 'Das Support-Team hat geantwortet',
  },
  nl: {
    subjects: {
      feedback: 'op je feedback',
      feature_request: 'op je functieverzoek',
      bug_report: 'op je bugmelding',
    },
    replied: (subject) => `Het supportteam heeft ${subject} gereageerd`,
    repliedInChat: 'Het supportteam heeft gereageerd',
  },
  pt: {
    subjects: {
      feedback: 'ao seu feedback',
      feature_request: 'à sua sugestão de recurso',
      bug_report: 'ao seu relato de bug',
    },
    replied: (subject) => `A equipe de suporte respondeu ${subject}`,
    repliedInChat: 'A equipe de suporte respondeu',
  },
  it: {
    subjects: {
      feedback: 'al tuo feedback',
      feature_request: 'alla tua richiesta di funzionalità',
      bug_report: 'alla tua segnalazione di bug',
    },
    replied: (subject) => `Il team di assistenza ha risposto ${subject}`,
    repliedInChat: 'Il team di assistenza ha risposto',
  },
  pl: {
    subjects: {
      feedback: 'na Twoją opinię',
      feature_request: 'na Twoją prośbę o funkcję',
      bug_report: 'na Twoje zgłoszenie błędu',
    },
    replied: (subject) => `Zespół pomocy odpowiedział ${subject}`,
    repliedInChat: 'Zespół pomocy odpowiedział',
  },
  tr: {
    subjects: {
      feedback: 'geri bildiriminizi',
      feature_request: 'özellik isteğinizi',
      bug_report: 'hata bildiriminizi',
    },
    replied: (subject) => `Destek ekibi ${subject} yanıtladı`,
    repliedInChat: 'Destek ekibi yanıtladı',
  },
  ru: {
    subjects: {
      feedback: 'на ваш отзыв',
      feature_request: 'на ваш запрос функции',
      bug_report: 'на ваше сообщение об ошибке',
    },
    replied: (subject) => `Команда поддержки ответила ${subject}`,
    repliedInChat: 'Команда поддержки ответила',
  },
  ja: {
    subjects: {
      feedback: 'フィードバック',
      feature_request: '機能リクエスト',
      bug_report: 'バグ報告',
    },
    replied: (subject) => `サポートチームが${subject}に返信しました`,
    repliedInChat: 'サポートチームが返信しました',
  },
  ko: {
    subjects: {
      feedback: '피드백',
      feature_request: '기능 요청',
      bug_report: '버그 신고',
    },
    replied: (subject) => `고객지원팀이 ${subject}에 답변했습니다`,
    repliedInChat: '고객지원팀이 답변했습니다',
  },
  zh: {
    subjects: {
      feedback: '反馈',
      feature_request: '功能请求',
      bug_report: '错误报告',
    },
    replied: (subject) => `客服团队回复了你的${subject}`,
    repliedInChat: '客服团队回复了你',
  },
  hi: {
    subjects: {
      feedback: 'आपके फ़ीडबैक',
      feature_request: 'आपके फ़ीचर अनुरोध',
      bug_report: 'आपकी बग रिपोर्ट',
    },
    replied: (subject) => `सहायता टीम ने ${subject} का जवाब दिया`,
    repliedInChat: 'सहायता टीम ने जवाब दिया',
  },
};

/**
 * Notification body for "the support team replied", in the end user's
 * language. A support chat gets the plain "replied"; the typed threads name
 * what was answered. Unknown languages and unknown query types both fall back to
 * English.
 */
export function replyNotification(
  language: string,
  queryType: string,
): string {
  const copy = COPY[language] ?? COPY.en!;
  if (queryType === 'support') return copy.repliedInChat;
  const subject =
    copy.subjects[queryType as QueryType] ?? COPY.en!.subjects.feedback;
  return copy.replied(subject);
}
