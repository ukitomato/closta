//! What an `AskUserQuestion` asks, as the approval shows it (Question.kt).

use closta_presenter::json::JsonFields;
use closta_presenter::keyed::claim_key;
use serde_json::{Map, Value};

/// The first question's text and options (what the parts that show one prompt read), and
/// `questions`, all of them.
#[derive(Clone, PartialEq, Eq, Debug)]
pub(crate) struct Question {
    pub prompt: Option<String>,
    pub options: Vec<AnswerOption>,
    pub questions: Vec<AskedQuestion>,
}

/// One of the questions of a call: `id` is `q1`, `q2`… by its place among them, and its options
/// are made as the first question's are.
#[derive(Clone, PartialEq, Eq, Debug)]
pub(crate) struct AskedQuestion {
    pub id: String,
    pub prompt: Option<String>,
    pub multi_select: bool,
    pub options: Vec<AnswerOption>,
}

/// One answer. `id` is the label, made unique within the question when two options share one.
#[derive(Clone, PartialEq, Eq, Debug)]
pub(crate) struct AnswerOption {
    pub id: String,
    pub label: String,
    pub description: Option<String>,
}

/// The id of the question at `position` (from 0) among the questions of a call.
fn question_id(position: usize) -> String {
    format!("q{}", position + 1)
}

/// What a request asks: the options from the request's input, else from the tool call's own input
/// (the same `questions[0]` shape), and the question's text from whichever has it. `None` when
/// neither says anything; a question without options cannot be answered by choosing, but its
/// text is still worth showing.
pub(crate) fn asked_question(request: Option<&Value>, call: Option<&Value>) -> Option<Question> {
    let from_request = asked_questions(request);
    let from_call = asked_questions(call);
    let first = from_request.first();
    let options = first
        .map(|it| it.options.clone())
        .filter(|it| !it.is_empty())
        .or_else(|| from_call.first().map(|it| it.options.clone()))
        .unwrap_or_default();
    let prompt = first
        .and_then(|it| it.prompt.clone())
        .or_else(|| from_call.first().and_then(|it| it.prompt.clone()));
    let questions = if from_request.is_empty() {
        from_call
    } else {
        from_request
    };
    if options.is_empty() && prompt.is_none() && questions.is_empty() {
        None
    } else {
        Some(Question {
            prompt,
            options,
            questions,
        })
    }
}

/// The questions of `input` (an `AskUserQuestion`'s), in order: the entries of `questions` that
/// are objects, each with the options it lists. A question without text has no prompt: it still
/// has options to choose from.
pub(crate) fn asked_questions(input: Option<&Value>) -> Vec<AskedQuestion> {
    input
        .and_then(Value::as_object)
        .and_then(|it| it.array("questions"))
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .filter_map(Value::as_object)
        .enumerate()
        .map(|(position, question)| AskedQuestion {
            id: question_id(position),
            prompt: question.string("question").map(str::to_owned),
            multi_select: question.get("multiSelect") == Some(&Value::Bool(true)),
            options: options_of(question),
        })
        .collect()
}

/// The options of a question, each id its label, made unique within the question when two share
/// one.
fn options_of(question: &Map<String, Value>) -> Vec<AnswerOption> {
    let mut ids: Vec<String> = Vec::new();
    question
        .array("options")
        .map(Vec::as_slice)
        .unwrap_or_default()
        .iter()
        .filter_map(Value::as_object)
        .filter_map(|fields| {
            let label = fields.string("label")?;
            let id = claim_key(|taken| ids.iter().any(|it| it == taken), label);
            ids.push(id.clone());
            Some(AnswerOption {
                id,
                label: label.to_owned(),
                description: fields.string("description").map(str::to_owned),
            })
        })
        .collect()
}
