import React from 'react';
import createReactClass from 'create-react-class';
import PropTypes from 'prop-types';
import classNames from 'classnames';
import ObserveModelMixin from '../ObserveModelMixin';
import parseCustomHtmlToReact from '../Custom/parseCustomHtmlToReact';
import { Small, Medium } from '../Generic/Responsive';
import Icon from "../Icon.jsx";
import { Swipeable } from 'react-swipeable';
import Styles from './story-panel.scss';

export function activateStory(story, terria) {
     if(story.shareData) {
        terria.updateFromStartData(story.shareData,true).then(()=>{
        const nowViewingPaths = story.shareData.initSources.reduce((p, c) => {
          if (c.sharedCatalogMembers) {
            return p.concat(Object.keys(c.sharedCatalogMembers));
          }
          return p;
        }, []);
        const nowViewing = terria.nowViewing.items;
        nowViewing.slice().forEach(item=>{
          const path = item.uniqueId; 
          if(nowViewingPaths.indexOf(path) < 0) {
            item.isEnabled = false;
          } 
        });
      });
    }
}

const StoryPanel = createReactClass({
    displayName: 'StoryPanel',
    mixins: [ObserveModelMixin],
    propTypes: {
        terria: PropTypes.object.isRequired,
        viewState: PropTypes.object.isRequired
    },
    slideInTimer: null,
    slideOutTimer: null,
    escKeyListener: null,

    getInitialState() {
        return {
           inView: false
        };
    },
    /* eslint-disable-next-line camelcase */
  UNSAFE_componentWillMount() {
    const stories = this.props.terria.stories || [];
    if(this.props.viewState.currentStoryId > stories.length - 1 || this.props.viewState.currentStoryId < 0) {
      this.props.viewState.currentStoryId = 0;
    }
    this.activateStory(stories[this.props.viewState.currentStoryId]);
  },    
    componentDidMount() {
        this.slideIn();
        this.escKeyListener = e => {
            if (e.keyCode === 27) {
                this.exitStory();
            }
        };
        window.addEventListener('keydown', this.escKeyListener, true);
    },

    slideIn() {
       this.slideInTimer = setTimeout(() => {
            this.setState({
                inView: true
            });
        }, 300);
    },

    slideOut() {
      this.slideOutTimer = this.setState({
        inView: false
      });
      setTimeout(() => {this.exitStory();}, 300);
    },

    componentWillUnmount() {
        window.removeEventListener('keydown', this.escKeyListener, false);
        clearTimeout(this.slideInTimer);
        if(this.slideOutTimer) {
          clearTimeout(this.slideOutTimer);
        }
    },

    navigateStory(index) {
        if(index < 0) {
          index = this.props.terria.stories.length - 1;
        } else if(index >= this.props.terria.stories.length) {
          index = 0;
        }
        if (index !== this.props.viewState.currentStoryId) {
            this.props.viewState.currentStoryId = index;
          if (index < (this.props.terria.stories || []).length) {
              this.activateStory(this.props.terria.stories[index]);
          }
      }
    },

    // This is in StoryPanel and StoryBuilder
    activateStory(_story) {
      const story = _story? _story : this.props.terria.stories[0];
      activateStory(story, this.props.terria);
    },

    onCenterScene(story) {
      if(story.shareData) {
        this.props.terria.updateFromStartData(story.shareData);
      }
    },
   
    goToPrevStory() {
      this.navigateStory(this.props.viewState.currentStoryId - 1);
    },

    goToNextStory() {
      this.navigateStory(this.props.viewState.currentStoryId + 1);
    },

    exitStory() {
        this.props.viewState.storyShown = false;
        this.props.terria.currentViewer.notifyRepaintRequired();
    },

    render() {
      const stories = this.props.terria.stories || [];
      const story= stories[this.props.viewState.currentStoryId];
      const locationBtn = <button className ={Styles.locationBtn} title='center scene' onClick = {this.onCenterScene.bind(this, story)}><Icon glyph ={Icon.GLYPHS.location}/></button>;
      const exitBtn = <button className={Styles.exitBtn} title="exit story" onClick={this.slideOut}><Icon glyph={Icon.GLYPHS.close}/></button>;
        return (
          <Swipeable onSwipedLeft = {this.goToNextStory} onSwipedRight={this.goToPrevStory}>
                <div className={classNames(Styles.fullPanel, {
                                 [Styles.isHidden]: !this.props.viewState.storyShown, 
                                 [Styles.isPushedUp]: this.props.viewState.chartIsOpen,
                                 [Styles.isCentered]: this.props.viewState.isMapFullScreen})}>
                        <div className={classNames(Styles.storyContainer, {[Styles.isMounted]: this.state.inView})} key={story.id}>
                          <Medium>
                           <div className={Styles.left}>
                               {locationBtn}
                               <button className={Styles.previousBtn} disabled={this.props.terria.stories.length <= 1} title="go to previous scene" onClick={this.goToPrevStory}><Icon glyph={Icon.GLYPHS.left}/></button>
                            </div>
                          </Medium>
                            <div className={Styles.story}>
                                <div className={Styles.storyHeader}>
                                  <Small>{locationBtn}</Small>
                                  {story.title && story.title.length > 0 ? <h3>{story.title}</h3> : <h3> untitled scene </h3>}
                                  <Small>{exitBtn}</Small>
                                  <If condition = {this.props.terria.stories.length >=2}>
                                    <Medium><div className={Styles.navBtn}> {stories.map((story, i)=><button title={`go to story ${story.title}`} type='button' key={story.id} onClick={()=>this.navigateStory(i)}> <Icon glyph={ i === this.props.viewState.currentStoryId ? Icon.GLYPHS.circleFull : Icon.GLYPHS.circleEmpty }/></button>)}</div>
                                 </Medium>
                                  </If>
                               </div>
                                {story.text && <div className={Styles.body}>{parseCustomHtmlToReact(story.text)}</div>}
                            </div>
                          <Medium>
                             <div className={Styles.right}>
                              {exitBtn} 
                             <button disabled={this.props.terria.stories.length <= 1 } className={Styles.nextBtn} title="go to next scene" onClick={this.goToNextStory}><Icon glyph={Icon.GLYPHS.right}/></button>
                             </div>
                          </Medium>
                        <Small><div className={Styles.navBtnMobile}> {stories.map((story, i)=><button title={`go to story ${story.title}`} type='button' key={story.id} className={classNames(Styles.mobileNavBtn, {[Styles.isActive]: i === this.props.viewState.currentStoryId})} onClick={()=>this.navigateStory(i)}>{i}</button>)}</div>
                                 </Small>
                        </div>

                </div>
         </Swipeable>
        );
    }
});

export default StoryPanel;
