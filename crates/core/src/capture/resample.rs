/// Streaming linear-interpolation resampler, continuous across the chunks it is fed. Positions
/// are exact: counted in steps of `1 / to` of an input sample, from the last sample of the
/// previous chunk.
pub struct Resampler {
    from: i64,
    to: i64,
    position: i64,
    last: f32,
}

impl Resampler {
    pub fn new(from: u32, to: u32) -> Self {
        Self {
            from: i64::from(from),
            to: i64::from(to),
            position: i64::from(to),
            last: 0.0,
        }
    }

    pub fn process(&mut self, input: &[f32]) -> Vec<f32> {
        let previous = self.last;
        let sample = |index: i64| match index {
            0 => previous,
            _ => input[index as usize - 1],
        };
        let mut output = Vec::new();
        while self.position / self.to < input.len() as i64 {
            let index = self.position / self.to;
            let fraction = (self.position % self.to) as f32 / self.to as f32;
            let (from, to) = (sample(index), sample(index + 1));
            output.push(from + (to - from) * fraction);
            self.position += self.from;
        }
        if let Some(&last) = input.last() {
            self.last = last;
            self.position -= input.len() as i64 * self.to;
        }
        output
    }
}
