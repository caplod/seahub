define([
    'jquery',
    'underscore',
    'backbone',
    'common',
    'file-tree',
    'app/views/share',
    'app/views/dialogs/dirent-mvcp',
    'app/views/folder-perm',
    'app/views/widgets/hl-item-view',
    'app/views/widgets/dropdown'
], function($, _, Backbone, Common, FileTree, ShareView, DirentMvcpDialog,
    FolderPermView, HLItemView, DropdownView) {
    'use strict';

    var DirentView = HLItemView.extend({
        tagName: 'tr',

        fileTemplate: _.template($('#dirent-file-tmpl').html()),
        dirTemplate: _.template($('#dirent-dir-tmpl').html()),
        renameTemplate: _.template($("#rename-form-template").html()),

        initialize: function(options) {
            HLItemView.prototype.initialize.call(this);

            this.dirView = options.dirView;
            this.dir = this.dirView.dir;

            this.listenTo(this.model, "change", this.render);
            this.listenTo(this.model, 'remove', this.remove); // for multi dirents: delete, mv
        },

        render: function() {
            var dir = this.dir;
            var dirent_path = Common.pathJoin([dir.path, this.model.get('obj_name')]);
            var is_pro = app.pageOptions.is_pro;
            var file_audit_enabled = app.pageOptions.file_audit_enabled;
            var file_icon_size = Common.isHiDPI() ? 48 : 24;
            var template;
            if (this.model.get('is_dir')) {
                template = this.dirTemplate;
            } else {
                template = this.fileTemplate;
            }

            this.$el.html(template({
                dirent: this.model.attributes,
                dirent_path: dirent_path,
                encoded_path: Common.encodePath(dirent_path),
                icon_url: this.model.getIconUrl(file_icon_size),
                url: this.model.getWebUrl(),
                download_url: this.model.getDownloadUrl(),
                category: dir.category,
                repo_id: dir.repo_id,
                is_repo_owner: dir.is_repo_owner,
                is_virtual: dir.is_virtual,
                has_been_shared_out: dir.has_been_shared_out,
                can_generate_share_link: app.pageOptions.can_generate_share_link,
                can_generate_upload_link: app.pageOptions.can_generate_upload_link,
                is_pro: is_pro,
                file_audit_enabled: file_audit_enabled,
                repo_encrypted: dir.encrypted
            }));
            this.$('.file-locked-icon').attr('title', gettext("locked by {placeholder}").replace('{placeholder}', this.model.get('lock_owner_name')));
            this.dropdown = new DropdownView({
                el: this.$('.sf-dropdown')
            });

            // for image files
            this.$('.img-name-link').magnificPopup(this.dirView.magnificPopupOptions);

            return this;
        },

        events: {
            'click .select': 'select',
            'click .file-star': 'starFile',
            'click .img-name-link': 'viewImageWithPopup',
            'click .download-dir': 'downloadDir',
            'click .share': 'share',
            'click .delete': 'del', // 'delete' is a preserve word
            'click .rename': 'rename',
            'click .mv': 'mvcp',
            'click .cp': 'mvcp',
            'click .set-folder-permission': 'setFolderPerm',
            'click .lock-file': 'lockFile',
            'click .unlock-file': 'unlockFile',
            'click .open-via-client': 'open_via_client'
        },

        _hideMenu: function() {
            this.dropdown.hide();
        },

        select: function () {
            var $checkbox = this.$('[type=checkbox]');
            if ($checkbox.prop('checked')) {
                this.model.set({'selected':true}, {silent:true}); // do not trigger the 'change' event.
            } else {
                this.model.set({'selected':false}, {silent:true});
            }

            var dirView = this.dirView;
            var $dirents_op = dirView.$('#multi-dirents-op');
            var $toggle_all_checkbox = dirView.$('th [type=checkbox]');
            var checked_num = 0;
            dirView.$('tr:gt(0) [type=checkbox]').each(function() {
                if ($(this).prop('checked')) {
                    checked_num += 1;
                }
            });

            var $curDirOps = dirView.$('#cur-dir-ops');

            if (checked_num > 0) {
                $dirents_op.css({'display':'inline-block'});
                $curDirOps.hide();
            } else {
                $dirents_op.hide();
                $curDirOps.show();
            }
            if (checked_num == dirView.$('tr:gt(0)').length) {
                $toggle_all_checkbox.prop('checked', true);
            } else {
                $toggle_all_checkbox.prop('checked', false);
            }
        },

        downloadDir: function() {
            var dir = this.dirView.dir;
            var obj_name = this.model.get('obj_name');
            Common.zipDownload(dir.repo_id, dir.path, obj_name);
            return false;
        },

        starFile: function() {
            var _this = this;
            var dir = this.dirView.dir;
            var starred = this.model.get('starred');
            var filePath = Common.pathJoin([dir.path, this.model.get('obj_name')]);
            if (starred) {
                $.ajax({
                    url: Common.getUrl({'name':'starred_files'})
                        + '?repo_id=' + dir.repo_id + '&p=' + encodeURIComponent(filePath),
                    type: 'DELETE',
                    cache: false,
                    dataType: 'json',
                    beforeSend: Common.prepareCSRFToken,
                    success: function() {
                        _this.model.set({'starred':false});
                    },
                    error: function(xhr) {
                        Common.ajaxErrorHandler(xhr);
                    }
                });
            } else {
                $.ajax({
                    url: Common.getUrl({'name':'starred_files'}),
                    type: 'POST',
                    cache: false,
                    dataType: 'json',
                    beforeSend: Common.prepareCSRFToken,
                    data: {
                        'repo_id': dir.repo_id,
                        'p': filePath
                    },
                    success: function() {
                        _this.model.set({'starred':true});
                    },
                    error: function(xhr) {
                        Common.ajaxErrorHandler(xhr);
                    }
                });
            }

            return false;
        },

        viewImageWithPopup: function() {
            var index = $('.img-name-link', this.dirView.$dirent_list).index(this.$('.img-name-link'));
            $.magnificPopup.open(this.dirView.magnificPopupOptions, index);
        },

        share: function() {
            var dir = this.dir,
                obj_name = this.model.get('obj_name'),
                dirent_path = Common.pathJoin([dir.path, obj_name]);

            var options = {
                'is_repo_owner': dir.is_repo_owner,
                'is_virtual': dir.is_virtual,
                'user_perm': this.model.get('perm'),
                'repo_id': dir.repo_id,
                'repo_encrypted': false,
                'is_dir': this.model.get('is_dir') ? true : false,
                'dirent_path': dirent_path,
                'obj_name': obj_name
            };
            new ShareView(options);
            return false;
        },

        del: function() {
            var dirent_name = this.model.get('obj_name');
            this.model.deleteFromServer({
                success: function(data) {
                    var msg = gettext("Successfully deleted %(name)s")
                        .replace('%(name)s', dirent_name);
                    Common.feedback(msg, 'success');
                },
                error: function(xhr) {
                    Common.ajaxErrorHandler(xhr);
                }
            });
            return false;
        },

        rename: function() {
            var dirent_name = this.model.get('obj_name');

            var form = $(this.renameTemplate({
                dirent_name: dirent_name
            }));

            var $name = this.$('.dirent-name'),
                $op = this.$('.dirent-op'),
                $td = $name.closest('td');
            $td.attr('colspan', 2).css({
                'width': $name.width() + $op.outerWidth(),
                'height': $name.height()
            }).append(form);
            $op.hide();
            $name.hide();

            var $input = $('[name="newname"]', form);
            var dot_index = dirent_name.lastIndexOf('.');
            if (!this.model.get('is_dir') && dot_index != -1) {
                $input[0].setSelectionRange(0, dot_index);
            } else {
                $input.select();
            }

            this._hideMenu();
            app.ui.freezeItemHightlight = true;

            var after_op_success = function(data) {
                app.ui.freezeItemHightlight = false;
                if (app.ui.currentHighlightedItem) {
                    app.ui.currentHighlightedItem.rmHighlight();
                }
            };
            var cancelRename = function() {
                app.ui.freezeItemHightlight = false;
                if (app.ui.currentHighlightedItem) {
                    app.ui.currentHighlightedItem.rmHighlight();
                }
                form.remove();
                $op.show();
                $name.show();
                $td.attr('colspan', 1).css({
                    'width': $name.width()
                });
                return false; // stop bubbling (to 'doc click to hide .hidden-op')
            };
            $('.cancel', form).click(cancelRename);

            var _this = this;
            form.submit(function() {
                var new_name = $.trim($('[name="newname"]', form).val());
                if (!new_name) {
                    return false;
                }
                if (new_name == dirent_name) {
                    cancelRename();
                    return false;
                }

                var submit_btn = $('[type="submit"]', form);
                Common.disableButton(submit_btn);

                var after_op_error = function(xhr) {
                    var err_msg;
                    if (xhr.responseText) {
                        err_msg = $.parseJSON(xhr.responseText).error_msg;
                    } else {
                        err_msg = gettext("Failed. Please check the network.");
                    }
                    Common.feedback(err_msg, 'error');
                    Common.enableButton(submit_btn);
                };
                _this.model.rename({
                    newname: new_name,
                    success: after_op_success,
                    error: after_op_error
                });
                return false;
            });
            return false;
        },

        mvcp: function(e) {
            var op_type = $(e.currentTarget).hasClass('mv') ? 'mv' : 'cp';
            var options = {
                'dir': this.dir,
                'dirent': this.model,
                'op_type': op_type
            };

            this._hideMenu();
            new DirentMvcpDialog(options);
            return false;
        },

        setFolderPerm: function() {
            var options = {
                'obj_name': this.model.get('obj_name'),
                'dir_path': this.dir.path,
                'repo_id': this.dir.repo_id
            };
            this._hideMenu();
            new FolderPermView(options);
            return false;
        },

        lockFile: function() {
            var _this = this;
            this._hideMenu();
            this.model.lockFile({
                success: function() {
                    _this.$el.removeClass('hl');
                },
                error: function(xhr) {
                    Common.ajaxErrorHandler(xhr);
                }
            });
            return false;
        },

        unlockFile: function() {
            var _this = this;
            this._hideMenu();
            this.model.unlockFile({
                success: function() {
                    _this.$el.removeClass('hl');
                },
                error: function(xhr) {
                    Common.ajaxErrorHandler(xhr);
                }
            });
            return false;
        },

        open_via_client: function() {
            this._hideMenu();
            return true;
        }

    });

    return DirentView;
});
