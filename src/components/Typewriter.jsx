import React from "react";
import AiMarkdown from "./AiMarkdown";

function Typewriter({
  text,
  delay,
  small = false,
  skipAnimation = false,
  setSkipAnimation = () => {},
  setWriting = () => {},
  onComplete = () => {},
}) {
  const [currentText, setCurrentText] = React.useState("");
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [finished, setFinished] = React.useState(false);

  React.useEffect(() => {
    setCurrentText("");
    setCurrentIndex(0);
    setFinished(false);
  }, [text]);

  React.useEffect(() => {
    if (finished) return;

    if (skipAnimation) {
      setCurrentText(text);
      setCurrentIndex(text.length);
      setFinished(true);
      setSkipAnimation(false);
      setWriting(false);
      onComplete();
      return;
    }

    if (currentIndex < text.length) {
      setWriting(true);
      const timeout = setTimeout(() => {
        setCurrentText((prevText) => prevText + text[currentIndex]);
        setCurrentIndex((prevIndex) => prevIndex + 1);
      }, delay);
      return () => clearTimeout(timeout);
    }

    setFinished(true);
    setWriting(false);
    onComplete();
  }, [
    currentIndex,
    delay,
    finished,
    onComplete,
    setSkipAnimation,
    setWriting,
    skipAnimation,
    text,
  ]);

  if (small) {
    return <AiMarkdown fontSize={11}>{currentText}</AiMarkdown>;
  }
  return <AiMarkdown>{currentText}</AiMarkdown>;
}

export default Typewriter;
