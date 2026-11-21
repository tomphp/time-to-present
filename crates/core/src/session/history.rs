use crate::script::Script;

/// The linear undo/redo stack: a snapshot of the Script before each step, without limit.
#[derive(Debug, Default)]
pub struct History {
    undo: Vec<Script>,
    redo: Vec<Script>,
}

impl History {
    pub fn record(&mut self, before: Script) {
        self.undo.push(before);
        self.redo.clear();
    }

    pub fn undo(&mut self, current: &mut Script) -> bool {
        Self::step(&mut self.undo, &mut self.redo, current)
    }

    pub fn redo(&mut self, current: &mut Script) -> bool {
        Self::step(&mut self.redo, &mut self.undo, current)
    }

    fn step(from: &mut Vec<Script>, to: &mut Vec<Script>, current: &mut Script) -> bool {
        match from.pop() {
            Some(script) => {
                to.push(std::mem::replace(current, script));
                true
            }
            None => false,
        }
    }
}
