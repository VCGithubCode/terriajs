import { observer } from "mobx-react";
import PropTypes from "prop-types";
import React from "react";
import { withTranslation } from "react-i18next";
import { withTheme } from "styled-components";
import Spacing from "../../../../Styled/Spacing";
import Text from "../../../../Styled/Text";
import Box from "../../../../Styled/Box";
import styled from "styled-components";

const Numbers = styled(Text)`
  width: 22px;
  height: 22px;
  line-height: 22px;
  border-radius: 50%;
  ${props => props.darkBg && `background-color: ${props.theme.textDarker};`}
`;

const renderOrderedList = function(contents) {
  console.log(contents);
  return (
    <For each="content" index="i" of={contents}>
      <Box paddedVertically>
        <Box centered>
          <Numbers textLight textAlignCenter darkBg>
            {i + 1}
          </Numbers>
          <Spacing right={3} />
        </Box>
        <Text medium textDark>
          {content}
        </Text>
      </Box>
    </For>
  );
};

@observer
class StyledHtml extends React.Component {
  static displayName = "StyledHtml";

  static propTypes = {
    terria: PropTypes.object.isRequired,
    viewState: PropTypes.object.isRequired,
    content: PropTypes.array,
    theme: PropTypes.object,
    t: PropTypes.func.isRequired
  };

  constructor(props) {
    super(props);
  }

  render() {
    console.log(this.props.content);
    return (
      <div>
        <For each="item" of={this.props.content}>
          <Choose>
            <When condition={/(h[0-6]|p)/i.test(item.type)}>
              <Text
                textDark
                bold={/(h[0-6])/i.test(item.type)} // Only headers are bold
                subHeading={item.type === "h1"}
                medium={item.type === "p"}
              >
                {item.props.children}
                <Spacing bottom={3} />
              </Text>
            </When>
            <When condition={item.type === "ol"}>
              {renderOrderedList(
                item.props.children.map(point => point.props.children)
              )}
            </When>
            <Otherwise>
              {/* If it's none of the above tags, just render as 
                  normal html but with the same text formatting.
                  We can style more tags as necessary */}
              <Text textDark medium>
                {item}
              </Text>
            </Otherwise>
          </Choose>
        </For>
      </div>
    );
  }
}

export default withTranslation()(withTheme(StyledHtml));
